import secrets
import hashlib

import file_io

alphabet_tuple = ('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k',
                 'm', 'n', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z')
number_tuple = ('0', '1', '2', '3', '4', '5', '6', '7', '8', '9')
special_tuple = ('!', '?', '@', '#', '$', '%', '&', '*')


def generate_password(user_digits, with_upper_case):
    """write a description here"""
    password = ''
    if with_upper_case:
        upper_alphabet = [letter.upper() for letter in alphabet_tuple]
        upper_tuple = tuple(upper_alphabet)
        all_tuple = alphabet_tuple + upper_tuple + number_tuple + special_tuple
    else:
        all_tuple = alphabet_tuple + number_tuple + special_tuple
    for counter in range(user_digits):
        index = secrets.randbelow(len(all_tuple))
        password = password + all_tuple[index]
    return password
