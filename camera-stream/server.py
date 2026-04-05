from flask import Flask, render_template, request, Response, jsonify
import socket
import os
import threading
import time
import ssl

app = Flask(__name__)

latest_frame = None
frame_lock = threading.Lock()

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

def generate_cert(ip):
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from datetime import datetime, timedelta
    import ipaddress
    
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "RU"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "CameraStream"),
        x509.NameAttribute(NameOID.COMMON_NAME, ip),
    ])
    
    now = datetime.utcnow()
    
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=365))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.IPAddress(ipaddress.ip_address(ip)),
                x509.DNSName("localhost"),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    
    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()
    )
    
    with open("cert.pem", "wb") as f:
        f.write(cert_pem)
    with open("key.pem", "wb") as f:
        f.write(key_pem)
    
    return "cert.pem", "key.pem"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload_frame", methods=["POST"])
def upload_frame():
    global latest_frame
    data = request.get_data()
    
    if data:
        with frame_lock:
            latest_frame = data
        return jsonify({"status": "ok"}), 200
    
    return jsonify({"status": "no data"}), 400

def generate_mjpeg():
    while True:
        with frame_lock:
            frame = latest_frame
        
        if frame:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(frame)).encode() + b"\r\n"
                b"\r\n" + frame + b"\r\n"
            )
        
        time.sleep(0.033)

@app.route("/video_feed")
def video_feed():
    return Response(
        generate_mjpeg(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )

if __name__ == "__main__":
    ip = get_local_ip()
    port = 5000
    
    print("=" * 60)
    print("📷 Camera Stream Server")
    print("=" * 60)
    print(f"🔍 Обнаружен IP раздачи: {ip}")
    
    # Удаляем старые сертификаты если IP изменился
    if os.path.exists("cert.pem"):
        os.remove("cert.pem")
    if os.path.exists("key.pem"):
        os.remove("key.pem")
    
    try:
        print(f"🔧 Создание SSL сертификата для {ip}...")
        cert_file, key_file = generate_cert(ip)
        
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(cert_file, key_file)
        protocol = "https"
        print("✅ SSL сертификат создан")
    except Exception as e:
        print(f"⚠️ SSL ошибка: {e}")
        import traceback
        traceback.print_exc()
        ssl_context = None
        protocol = "http"
    
    print()
    print(f"📱 iPhone: {protocol}://{ip}:{port}")
    print(f"🖥️  PC:    {protocol}://{ip}:{port}")
    print()
    print("⚠️  На iPhone: при предупреждении нажмите 'Дополнительно' → 'Посетить сайт'")
    print("=" * 60)
    
    if ssl_context:
        app.run(host="0.0.0.0", port=port, ssl_context=ssl_context, debug=False)
    else:
        app.run(host="0.0.0.0", port=port, debug=False)