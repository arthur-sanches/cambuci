class User:

    def __init__(self, user_login, user_password):
        self.__login = {'user_login': user_login}
        self.__password = {'user_password': user_password}
        self.__service_accounts = []

    @property
    def login(self):
        return self.__login

    @login.setter
    def login(self, new_login):
        self.__login['user_login'] = new_login

    @property
    def password(self):
        return self.__password

    @password.setter
    def password(self, new_password):
        self.__password['user_password'] = new_password

    @property
    def service_accounts(self):
        return self.__service_accounts

    @service_accounts.setter
    def service_accounts(self, accounts):
        self.__service_accounts = accounts

    def add_service_account(self, service, login, password):
        service_login_password = {service:
                                  {login: password}
                                  }
        self.__service_accounts.append(service_login_password)
        # example {'google': {'tuta': 'senha123'}}
