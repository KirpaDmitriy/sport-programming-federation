import os
import smtplib
from email.message import EmailMessage


class SmtpMailer:
    def __init__(self) -> None:
        self.host = os.environ.get("VYGOTSKY_SMTP_HOST", "")
        self.port = int(os.environ.get("VYGOTSKY_SMTP_PORT", "587"))
        self.username = os.environ.get("VYGOTSKY_SMTP_USERNAME", "")
        self.password = os.environ.get("VYGOTSKY_SMTP_PASSWORD", "")
        self.sender = os.environ.get("VYGOTSKY_SMTP_FROM", self.username)
        self.use_tls = os.environ.get("VYGOTSKY_SMTP_TLS", "1") == "1"

    def send_verification(self, recipient: str, code: str) -> None:
        if not self.host or not self.sender:
            raise RuntimeError("SMTP is not configured")
        message = EmailMessage()
        message["Subject"] = "Код подтверждения — Выготский"
        message["From"] = self.sender
        message["To"] = recipient
        message.set_content(
            f"Ваш код подтверждения: {code}\n\n"
            "Код действует 30 минут. Если вы не регистрировались в сервисе «Выготский», проигнорируйте письмо."
        )
        with smtplib.SMTP(self.host, self.port, timeout=15) as smtp:
            if self.use_tls:
                smtp.starttls()
            if self.username:
                smtp.login(self.username, self.password)
            smtp.send_message(message)
