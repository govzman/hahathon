"""
Локальный HTTPS-сервер для тестирования на iPhone.
Раздаёт собранный Vite dist/ с самоподписанным сертификатом (SAN = локальный IP).

Запуск:
    pip install flask cryptography
    npm run build       # сначала собери фронт
    python serve_https.py
"""

from flask import Flask, send_from_directory
import socket
import os
import ssl

app = Flask(__name__)
DIST = os.path.join(os.path.dirname(__file__), "dist")


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    full = os.path.join(DIST, path)
    if path and os.path.exists(full) and os.path.isfile(full):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def generate_cert(ip):
    from cryptography import x509
    from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from datetime import datetime, timezone, timedelta
    import ipaddress

    # ECDSA P-256 — лучше совместим с iOS чем RSA
    key = ec.generate_private_key(ec.SECP256R1())
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, ip),
    ])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=365))
        # iOS требует SAN с IP
        .add_extension(
            x509.SubjectAlternativeName([
                x509.IPAddress(ipaddress.ip_address(ip)),
                x509.DNSName("localhost"),
            ]),
            critical=False,
        )
        # iOS требует Extended Key Usage
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        # iOS требует Key Usage
        .add_extension(
            x509.KeyUsage(
                digital_signature=True, key_encipherment=False,
                content_commitment=False, key_agreement=True,
                key_cert_sign=False, crl_sign=False,
                encipher_only=False, decipher_only=False,
                data_encipherment=False,
            ),
            critical=True,
        )
        .sign(key, hashes.SHA256())
    )
    with open("cert.pem", "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    with open("key.pem", "wb") as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))


if __name__ == "__main__":
    if not os.path.isdir(DIST):
        print("❌ Папка dist/ не найдена. Сначала запусти: npm run build")
        exit(1)

    ip = get_local_ip()
    port = 5001

    # Если есть mkcert сертификаты — используем их (надёжнее для iOS)
    mkcert_cert = f"{ip}+1.pem"
    mkcert_key  = f"{ip}+1-key.pem"
    if os.path.exists(mkcert_cert) and os.path.exists(mkcert_key):
        print(f"✅ Найдены mkcert сертификаты — используем их")
        cert_file, key_file = mkcert_cert, mkcert_key
    else:
        print(f"🔧 Генерирую SSL сертификат для {ip}...")
        generate_cert(ip)
        cert_file, key_file = "cert.pem", "key.pem"
        print("✅ Сертификат готов")

    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(cert_file, key_file)

    print()
    print("=" * 50)
    print(f"📱 Открой на iPhone: https://{ip}:{port}")
    print("   Safari спросит про сертификат →")
    print("   'Подробнее' → 'Перейти на сайт'")
    print("=" * 50)

    app.run(host="0.0.0.0", port=port, ssl_context=ssl_ctx, debug=False)
