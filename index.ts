import express from "express";
import { PrismaClient } from "@prisma/client";
import fetchTweet from "./src/tweets";
import cors from "cors";

const app = express();
const prisma = new PrismaClient();

app.use(
  cors({
    origin: "*", // Allow all origins
    credentials: true,
  })
);

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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [markets, totalCount] = await prisma.$transaction([
      prisma.ratioed_market.findMany({
        include: {
          tweet_detail: true,
        },
        skip,
        take: limit,
        orderBy: {
          id: "desc", // Adjust ordering as needed
        },
      }),
      prisma.ratioed_market.count(),
    ]);

    const serializedMarkets = JSON.stringify(markets, (key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    });

    const parsedMarkets = JSON.parse(serializedMarkets).map((market: any) => ({
      ...market,
      tweet_details: market.tweet_detail,
      tweet_detail: undefined,
    }));

    res.json({
      markets: parsedMarkets,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount,
    });
  } catch (error) {
    console.error("Error fetching markets:", error);
    res.status(500).json({ error: "Error fetching markets" });
  }
});

// Create a new market
app.post("/markets", async (req, res) => {
  try {
    const {
      id,
      tweet_id,
      collateral_amount,
      yes_shares,
      no_shares,
      chance,
      settlement_deadline,
    } = req.body;

    // Create the market first
    const market = await prisma.ratioed_market.create({
      data: {
        id,
        tweet_id,
        collateral_amount: BigInt(collateral_amount),
        yes_shares: BigInt(yes_shares),
        no_shares: BigInt(no_shares),
        chance: BigInt(chance),
        settlement_deadline: BigInt(
          settlement_deadline || Date.now() + 86400000
        ),
      },
    });

    let tweetDetails;
    if (tweet_id) {
      try {
        tweetDetails = await fetchTweet(tweet_id);
        if (tweetDetails) {
          await prisma.tweet_detail.create({
            data: {
              id: tweet_id,
              text: tweetDetails.text,
              created_at: new Date(tweetDetails.created_at),
              user_profile_image_url: tweetDetails.user_profile_image_url,
              ratioed_market_id: market.id,
            },
          });
        }
      } catch (error) {
        console.error("Error fetching or creating tweet details:", error);
        // We're not failing the request, just logging the error
      }
    }

    res.json(serializeResponse(market));
  } catch (error: any) {
    console.error("Error creating market:", error);
    res.status(400).json({
      error: "Error creating market",
      details: error.message || "Unknown error",
    });
  }
});

// Get a specific market by ID
app.get("/markets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const market = await prisma.ratioed_market.findUnique({
      where: { id },
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

app.post("/markets/:id/update-tweet", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the market data
    const market = await prisma.ratioed_market.findUnique({
      where: { id },
      include: { tweet_detail: true },
    });

    if (!market) {
      return res.status(404).json({ error: `Market with id ${id} not found` });
    }

    // Fetch tweet details
    const tweetDetails = await fetchTweet(market.tweet_id);

    if (!tweetDetails) {
      return res.status(404).json({
        error: `Failed to fetch tweet details for tweet id ${market.tweet_id}`,
      });
    }

    // Update or create tweet_detail
    const updatedTweetDetail = await prisma.tweet_detail.upsert({
      where: { ratioed_market_id: market.id },
      update: {
        text: tweetDetails.text,
        created_at: new Date(tweetDetails.created_at),
        user_profile_image_url: tweetDetails.user_profile_image_url,
      },
      create: {
        id: market.tweet_id,
        text: tweetDetails.text,
        created_at: new Date(tweetDetails.created_at),
        user_profile_image_url: tweetDetails.user_profile_image_url,
        ratioed_market_id: market.id,
      },
    });

    res.json(
      serializeResponse({
        message: `Updated tweet details for market ${id}`,
        tweetDetail: updatedTweetDetail,
      })
    );
  } catch (error) {
    console.error("Error updating market with tweet details:", error);
    res.status(500).json({ error: "Error updating market with tweet details" });
  }
});

app.post("/update-tweets", async (req, res) => {
  console.log("UPDATE");
  try {
    // Find all markets without tweet details
    const marketsWithoutTweetDetails = await prisma.ratioed_market.findMany({
      where: {
        tweet_detail: null,
      },
      select: {
        id: true,
        tweet_id: true,
      },
    });

    const updatedMarkets = [];

    for (const market of marketsWithoutTweetDetails) {
      try {
        const tweetDetails = await fetchTweet(market.tweet_id);

        if (tweetDetails) {
          const updatedTweetDetail = await prisma.tweet_detail.create({
            data: {
              id: market.tweet_id,
              text: tweetDetails.text,
              created_at: new Date(tweetDetails.created_at),
              user_profile_image_url: tweetDetails.user_profile_image_url,
              ratioed_market_id: market.id,
            },
          });

          updatedMarkets.push({
            marketId: market.id,
            tweetDetail: updatedTweetDetail,
          });
        }
      } catch (error) {
        console.error(
          `Error updating tweet details for market ${market.id}:`,
          error
        );
      }
    }

    res.json(
      serializeResponse({
        message: `Updated tweet details for ${updatedMarkets.length} markets`,
        updatedMarkets,
      })
    );
  } catch (error) {
    console.error("Error updating all tweet details:", error);
    res.status(500).json({ error: "Error updating all tweet details" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`Server is running on http://localhost:${PORT}`)
);
