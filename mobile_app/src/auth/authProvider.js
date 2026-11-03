export const authProvider = {
  status: 'investigation-required',
  async signIn() {
    throw new Error('Admin and Service Provider authentication is not implemented.');
  },
  async signOut() {
    throw new Error('Authentication has not been implemented.');
  },
};
