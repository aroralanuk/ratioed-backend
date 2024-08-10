import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

function replacer(key: any, value: any) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

function serializeResponse(data: any) {
  return JSON.parse(JSON.stringify(data, replacer));
}

// Get all markets
app.get("/markets", async (req, res) => {
  try {
    const markets = await prisma.market.findMany();
    const serializedMarkets = JSON.stringify(markets, replacer);
    res.json(JSON.parse(serializedMarkets));
  } catch (error) {
    console.error("Error fetching markets:", error);
    res.status(500).json({ error: "Error fetching markets" });
  }
});

// Create a new market
app.post("/markets", async (req, res) => {
  try {
    const {
      tweet,
      collateralAmount,
      yesShares,
      noShares,
      chance,
      settlementDeadline,
    } = req.body;
    const market = await prisma.market.create({
      data: {
        tweet,
        collateralAmount: BigInt(collateralAmount),
        yesShares: BigInt(yesShares),
        noShares: BigInt(noShares),
        chance: BigInt(chance),
        settlementDeadline: BigInt(settlementDeadline || Date.now() + 86400000), // Default to 24 hours from now if not provided
      },
    });
    res.json(serializeResponse(market));
  } catch (error) {
    console.error("Error creating market:", error);
    res.status(400).json({ error: "Error creating market" });
  }
});

// Get a specific market by ID
app.get("/markets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const market = await prisma.market.findUnique({
      where: { id: Number(id) },
    });
    if (market) {
      res.json(market);
    } else {
      res.status(404).json({ error: "Market not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Error fetching market" });
  }
});

// Update a market
app.put("/markets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tweet,
      collateralAmount,
      yesShares,
      noShares,
      settlementDeadline,
      chance,
    } = req.body;
    const updatedMarket = await prisma.market.update({
      where: { id: Number(id) },
      data: {
        tweet,
        collateralAmount: BigInt(collateralAmount),
        yesShares: BigInt(yesShares),
        noShares: BigInt(noShares),
        settlementDeadline: BigInt(settlementDeadline),
        chance: BigInt(chance),
      },
    });
    res.json(updatedMarket);
  } catch (error) {
    res.status(400).json({ error: "Error updating market" });
  }
});

// Delete a market
app.delete("/markets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.market.delete({
      where: { id: Number(id) },
    });
    res.json({ message: "Market deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: "Error deleting market" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Server is running on http://localhost:${PORT}`)
);
