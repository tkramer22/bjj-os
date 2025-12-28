import { Request, Response, NextFunction } from "express";

export function noCacheMiddleware(req: Request, res: Response, next: NextFunction) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'X-Accel-Expires': '0'
  });
  next();
}
