interface User {
  id: string
  name: string
}

type UserMap = Record<string, User>

enum Role {
  Admin = 'admin',
  User = 'user'
}

class UserService<T> {
  constructor(private readonly items: T[]) {}
  getAll(): T[] {
    return this.items
  }
}

export function loadUsers(source: UserMap): User[] {
  const service = new UserService(Object.values(source))
  return service.getAll()
}
