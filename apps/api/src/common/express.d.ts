declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string | null;
      isAdmin: boolean;
      isDemo: boolean;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
