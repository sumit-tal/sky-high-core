import express, { Request, Response } from "express";

const PORT = 3002;
const MIN_WEIGHT_KG = 5;
const MAX_WEIGHT_KG = 30;

const createApp = (): express.Application => {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "stub-weight" });
  });

  app.get("/api/v1/baggage/weight/:passengerId", (req: Request, res: Response) => {
    const { passengerId } = req.params;
    const weight = parseFloat(
      (Math.random() * (MAX_WEIGHT_KG - MIN_WEIGHT_KG) + MIN_WEIGHT_KG).toFixed(1),
    );
    res.json({
      passengerId,
      weight,
      unit: "kg",
      timestamp: new Date().toISOString(),
    });
  });

  return app;
};

const app = createApp();
app.listen(PORT, () => {
  console.log(`Stub weight service running on port ${PORT}`);
});

export { createApp };
