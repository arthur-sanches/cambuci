import base64
import hashlib
import os
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def get_encryption_key(user):
    password_provided = user.password['user_password']
    password = password_provided.encode()
    login = user.login['user_login']
    salt = b'salt_' # Placeholder value - use a key from os.urandom(16), always use the same key, must be of type bytes
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA3_256(),
        length=32,
        salt=salt,
        iterations=250000,
        backend=default_backend()
    )
    key = base64.urlsafe_b64encode(kdf.derive(password))
    return key
