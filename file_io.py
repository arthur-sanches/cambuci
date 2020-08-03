import json


def create(user):
    name = user.login['user_login']
    try:
        with open(f'{name}.txt', mode='w', encoding='utf-8') as file:
            __write(user)
    except (IOError):
        print("Unable to create file.")


def __write(user):
    name = user.login['user_login']
    try:
        with open(f'{name}.txt', mode='w', encoding='utf-8') as file:
            user_info = [user.login, user.password, user.service_accounts]
            json.dump(user_info, file, ensure_ascii=False)
            
    except (IOError):
        print("Unable to write to file.")


def read(user):
    name = user.login['user_login']

    try:
        with open(f'{name}.txt', mode='r', encoding='utf-8') as file:
            user_info = json.load(file)
            user.service_accounts = user_info[2]
            user_info
    except (IOError):
        create(user)


def return_user(user):
    name = user.login['user_login']

    try:
        with open(f'{name}.txt', mode='r', encoding='utf-8') as file:
            user_info = json.load(file)
            return user_info
    except (IOError):
        pass


def save(user):
    pass

def user_exist(user):
    pass