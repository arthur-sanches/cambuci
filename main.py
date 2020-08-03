import secrets
import hashlib

import file_io
from user import User
from password_generator import generate_password


user_login = input('What is your login? \n')
user_password = input('What is your main password? \n')

user = User(user_login, user_password)

file_io.read(user)

with_upper_case = True

keep_looping = True

while keep_looping:
    service = input('For what service do you want a password? \n')
    service_login = input('What is your login for said service? \n')
    service_digits = int(
        input('How many digits do you want for your password? (8-16) \n'))

    generated_password = generate_password(service_digits, with_upper_case)

    user.add_service_account(service, service_login, generated_password)

    print(user.service_accounts)

    loop = input('Do you want to add another service? [Y/N]')
    if loop.upper() == 'N':
        keep_looping = False

file_io.__write(user)
