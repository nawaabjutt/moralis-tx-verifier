const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();
app.use(express.json());

// 🔐 Firebase Admin Init
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();

// ✅ POST endpoint to verify TXID
app.post("/verify-tx", async (req, res) => {
  const { txId, userId } = req.body;

  if (!txId || !userId) {
    return res.status(400).json({ error: "Missing txId or userId" });
  }

  try {
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2/transaction/${txId}?chain=bsc`,
      {
        headers: {
          "X-API-Key": process.env.MORALIS_API_KEY,
        },
      }
    );

    const tx = response.data;

    // ✅ Confirm TX went to your address
    if (tx.to_address.toLowerCase() !== process.env.RECEIVER_ADDRESS.toLowerCase()) {
      return res.status(400).json({ error: "TX not sent to your address" });
    }

    // ✅ Convert value from wei to BNB
    const amountBNB = parseFloat(tx.value) / 1e18;

    // ✅ Save to Firebase
    const userRef = db.ref(`users/${userId}`);
    const depositRef = userRef.child("deposits").push();

    await depositRef.set({
      txHash: txId,
      amount: amountBNB,
      from: tx.from_address,
      timestamp: tx.block_timestamp,
      status: "confirmed"
    });

    // ✅ Update user balance
    const balanceSnap = await userRef.child("balance").once("value");
    const currentBalance = balanceSnap.val() || 0;
    await userRef.child("balance").set(currentBalance + amountBNB);

    return res.status(200).json({ success: true, amount: amountBNB });

  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: "Failed to verify TX" });
  }
});

app.get("/", (req, res) => {
  res.send("TX Verifier running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
