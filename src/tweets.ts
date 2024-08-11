import { Rettiwt } from "rettiwt-api";

export default async function fetchTweet(id: string): Promise<any> {
  console.log("fetchTweet id", id);
  const rettiwt = new Rettiwt();

  try {
    const tweet = await rettiwt.tweet.details(id);

    if (tweet && tweet.fullText) {
      const tweetDetail = {
        text: tweet.fullText,
        created_at: tweet.createdAt,
        user_profile_image_url: tweet.tweetBy.profileImage,
      };
      return tweetDetail;
    } else {
      throw new Error("Tweet not found");
    }
  } catch (error) {
    console.error("Error fetching tweet details:", error);
    return null;
  }
}
