import json

class UserService:
    def __init__(self, users):
        self.users = users

    def all(self):
        return self.users

def load_users(raw):
    service = UserService(json.loads(raw))
    return service.all()
