import { type Request, type Response, type NextFunction } from 'express'

export type AsyncHandlerFn = (req: Request, res: Response, next: NextFunction) => Promise<void>
export type AsyncHandlerFnNoNext = (req: Request, res: Response) => Promise<void>
