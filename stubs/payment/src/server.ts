import express, { Request, Response } from "express";

const PORT = 3001;

const createApp = (): express.Application => {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "stub-payment" });
  });

  app.post("/api/v1/payments", (req: Request, res: Response) => {
    const { passengerId, amount, currency } = req.body as {
      passengerId: string;
      amount: number;
      currency: string;
    };
    res.status(201).json({
      transactionId: `txn_${Date.now()}`,
      passengerId,
      amount,
      currency: currency || "USD",
      status: "confirmed",
      timestamp: new Date().toISOString(),
    });
  });

  return app;
};

const app = createApp();
app.listen(PORT, () => {
  console.log(`Stub payment service running on port ${PORT}`);
});

export { createApp };
