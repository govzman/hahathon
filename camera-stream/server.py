from flask import Flask, render_template, request, Response, jsonify
import ssl
import socket
import os
import threading
import json
from datetime import datetime

app = Flask(__name__)

# Хранилище последнего кадра
latest_frame = None
frame_lock = threading.Lock()


def get_local_ip():
    """Получить локальный IP адрес компьютера"""
    import netifaces
    
    # Пробуем найти IP в сети 192.168.x.x
    try:
        for interface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(interface)
            if netifaces.AF_INET in addrs:
                for addr in addrs[netifaces.AF_INET]:
                    ip = addr['addr']
                    # Ищем IP в локальной сети (192.168.x.x или 10.x.x.x)
                    if ip.startswith('192.168.') or ip.startswith('10.'):
                        return ip
    except:
        pass
    
    # Fallback метод
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

@app.route("/")
def index():
    """Главная страница — определяет роль (камера или просмотр)"""
    return render_template("index.html")


@app.route("/upload_frame", methods=["POST"])
def upload_frame():
    """Принимает кадр с камеры телефона (JPEG в бинарном виде)"""
    global latest_frame
    if request.content_type and "image" in request.content_type:
        data = request.get_data()
    else:
        data = request.get_data()

    if data:
        with frame_lock:
            latest_frame = data
        return jsonify({"status": "ok"}), 200
    return jsonify({"status": "no data"}), 400


def generate_mjpeg():
    """Генератор MJPEG потока для просмотра"""
    boundary = b"--frame"
    while True:
        with frame_lock:
            frame = latest_frame

        if frame:
            yield (
                boundary + b"\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(frame)).encode() + b"\r\n"
                b"\r\n" + frame + b"\r\n"
            )

        # ~30 FPS максимум
        import time
        time.sleep(0.033)


@app.route("/video_feed")
def video_feed():
    """MJPEG поток для отображения на компьютере"""
    return Response(
        generate_mjpeg(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


def generate_self_signed_cert():
    """Генерация самоподписанного SSL сертификата (нужен для камеры на iOS)"""
    cert_file = "cert.pem"
    key_file = "key.pem"

    if os.path.exists(cert_file) and os.path.exists(key_file):
        return cert_file, key_file

    # Используем openssl через командную строку
    ip = get_local_ip()
    os.system(
        f'openssl req -x509 -newkey rsa:2048 -keyout {key_file} -out {cert_file} '
        f'-days 365 -nodes -subj "/CN={ip}" '
        f'-addext "subjectAltName=IP:{ip}" 2>/dev/null'
    )

    if os.path.exists(cert_file) and os.path.exists(key_file):
        return cert_file, key_file

    # Fallback: используем Python cryptography если openssl недоступен
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import ipaddress

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, ip),
        ])

        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.utcnow())
            .not_valid_after(datetime(2026, 1, 1))
            .add_extension(
                x509.SubjectAlternativeName([
                    x509.IPAddress(ipaddress.ip_address(ip)),
                ]),
                critical=False,
            )
            .sign(key, hashes.SHA256())
        )

        with open(key_file, "wb") as f:
            f.write(key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            ))

        with open(cert_file, "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))

        return cert_file, key_file
    except ImportError:
        print("⚠️  Установите cryptography: pip install cryptography")
        print("   Или установите openssl")
        raise


if __name__ == "__main__":
    ip = get_local_ip()
    port = 5000

    print("=" * 60)
    print("📷  Camera Stream Server")
    print("=" * 60)

    # Пробуем создать SSL (нужен для доступа к камере на iOS)
    try:
        cert_file, key_file = generate_self_signed_cert()
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(cert_file, key_file)
        protocol = "https"
        print(f"✅ SSL сертификат создан")
    except Exception as e:
        print(f"⚠️  SSL не удалось создать: {e}")
        print("   Камера может не работать без HTTPS!")
        ssl_context = None
        protocol = "http"

    print()
    print(f"📱 Откройте на iPhone:  {protocol}://{ip}:{port}")
    print(f"🖥️  Смотрите на ПК:     {protocol}://{ip}:{port}")
    print()
    print("На iPhone: нажмите 'Камера (отправитель)'")
    print("На ПК:     нажмите 'Просмотр (получатель)'")
    print("=" * 60)

    if ssl_context:
        app.run(host="0.0.0.0", port=port, ssl_context=ssl_context, debug=False)
    else:
        app.run(host="0.0.0.0", port=port, debug=False)