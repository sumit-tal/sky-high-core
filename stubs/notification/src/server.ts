import express, { Request, Response } from "express";

const PORT = 3003;

interface NotificationEvent {
  readonly type: string;
  readonly passengerId: string;
  readonly payload: Record<string, unknown>;
}

const createApp = (): express.Application => {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "stub-notification" });
  });

  app.post("/api/v1/notifications", (req: Request, res: Response) => {
    const { type, passengerId, payload } = req.body as NotificationEvent;
    console.log(`[NOTIFICATION] type=${type} passengerId=${passengerId}`, payload);
    res.status(202).json({
      notificationId: `notif_${Date.now()}`,
      type,
      passengerId,
      status: "accepted",
      timestamp: new Date().toISOString(),
    });
  });

  return app;
};

const app = createApp();
app.listen(PORT, () => {
  console.log(`Stub notification service running on port ${PORT}`);
});

export { createApp };
