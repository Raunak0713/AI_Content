import { db } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  console.log("Received POST request");

  const body = await req.text();
  const sig = headers().get("stripe-signature");

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    console.log("Stripe event constructed:", event);
  } catch (error) {
    console.error("Invalid signature:", error);
    return NextResponse.json({ error: "Invalid Signature" }, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session?.metadata?.userId;

  if (event.type === "checkout.session.completed") {
    console.log("Checkout session completed event received");

    if (!userId) {
      console.error("Invalid session: userId is missing");
      return new NextResponse("Invalid session", { status: 400 });
    }

    try {
      console.log("Searching for user with userId:", userId);

      const findUserByUserID = await db.user.findUnique({
        where: {
          userId: userId,
        },
      });

      if (!findUserByUserID) {
        console.log("User not found, creating new user with userId:", userId);
        
        await db.user.create({
          data: {
            userId: userId,
            totalCredit: 20000,
          },
        });

        console.log("User created successfully");
      } else {
        console.log("User found, updating totalCredit for userId:", userId);
        
        await db.user.update({
          where: {
            userId: userId,
          },
          data: {
            totalCredit: findUserByUserID.totalCredit + 10000,
          },
        });

        console.log("User updated successfully");
      }
    } catch (error) {
      console.error("Error updating user:", error);
      return new NextResponse("Invalid User not authorized", { status: 500 });
    }
  } else {
    console.log("Received invalid event type:", event.type);
    return new NextResponse("Invalid event", { status: 200 });
  }

  console.log("Request processed successfully");
  return new NextResponse("Success", { status: 200 });
}
