import jwt from 'jsonwebtoken';

const isAuthDisabled = () => process.env.AUTH_DISABLED === 'true';

export const authenticate = (req, res, next) => {
  if (isAuthDisabled()) {
    req.user = req.user ?? { sub: 'dev-user', role: 'owner', email: 'dev@example.com' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Missing authorization header' });
  }

  const [, token] = authHeader.split(' ');
  if (!token) {
    return res.status(401).json({ message: 'Invalid authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (isAuthDisabled()) {
      return next();
    }

    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };

