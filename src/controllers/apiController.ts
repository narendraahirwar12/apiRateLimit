import { Request, Response } from 'express';

export function getReports(req: Request, res: Response): void {
  res.json({
    message: 'Reports data',
    user: req.user,
    data: [
      { id: 1, title: 'Monthly Sales', date: '2025-01' },
      { id: 2, title: 'Q1 Summary', date: '2025-Q1' },
      { id: 3, title: 'Annual Review', date: '2024' },
    ],
  });
}

export function getProfile(req: Request, res: Response): void {
  res.json({
    message: 'User profile',
    user: req.user,
  });
}

export function getData(req: Request, res: Response): void {
  res.json({
    message: 'Protected data',
    timestamp: new Date(),
    user: req.user,
  });
}

export function postData(req: Request, res: Response): void {
  res.status(201).json({
    message: 'Data created',
    payload: req.body,
    createdBy: req.user,
  });
}
