require("dotenv").config();
const path = require("path");
const express = require("express");
const { estimateMeal } = require("./estimate-logic");

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/estimate", async (req, res) => {
  try {
    const result = await estimateMeal(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Fallback to index.html for any other route (simple single-page app).
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Thali is running at http://localhost:${PORT}`);
});
