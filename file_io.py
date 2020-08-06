import json
from cryptography.fernet import Fernet

from crypto_module import get_encryption_key


def create(user):
    try:
        __write(user)
    except (IOError):
        print("Unable to create file.")


def __write(user):
    try:
        with open(f'{name(user)}.txt', mode='wb') as file:
            user_info = [user.login, user.password, user.service_accounts]
            encrypted_data = encrypt(user, user_info)
            file.write(encrypted_data)

    except (IOError):
        print("Unable to write to file.")


def read(user):
    try:
        with open(f'{name(user)}.txt', mode='rb') as file:
            data = file.read()
            user_info = decrypt(user, data)
            user.service_accounts = user_info[2]
            user_info
    except (IOError):
        create(user)


def name(user):
    return user.login['user_login']


def encrypt(user, data):
    key = get_encryption_key(user)
    encoded_data = json.dumps(data).encode()
    f = Fernet(key)
    encrypted_data = f.encrypt(encoded_data)
    return encrypted_data


def decrypt(user, data):
    key = get_encryption_key(user)
    f = Fernet(key)
    decrypted_data = f.decrypt(data)
    decoded_data = decrypted_data.decode()
    json_formatted_data = json.loads(decoded_data)
    return json_formatted_data
