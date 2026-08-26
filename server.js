const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("."));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on("error", (err) => {
  console.error("Unexpected database error:", err);
});

/* ===============================
   TEST DATABASE
=============================== */

app.get("/api/test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      ok: true,
      message: "MEFCO Watch database connected!",
      time: result.rows[0].now
    });
  } catch (error) {
    console.error("DATABASE ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* ===============================
   MATCHES
=============================== */

app.get("/api/matches", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM matches
      ORDER BY match_date ASC, match_time ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("GET MATCHES ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/matches/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM matches
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Match not found."
      });
    }

    res.json({
      ok: true,
      match: result.rows[0]
    });
  } catch (error) {
    console.error("GET MATCH ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/matches", async (req, res) => {
  try {
    const {
      competition,
      home,
      away,
      home_flag,
      away_flag,
      match_date,
      match_time
    } = req.body;

    if (!competition || !home || !away || !match_date || !match_time) {
      return res.status(400).json({
        ok: false,
        error: "Competition, teams, date and kickoff time are required."
      });
    }

    const id =
      "m_" +
      Date.now() +
      "_" +
      Math.random().toString(36).slice(2, 7);

    const stats = {
      possessionHome: 50,
      possessionAway: 50,
      shotsHome: 0,
      shotsAway: 0,
      targetHome: 0,
      targetAway: 0,
      cornersHome: 0,
      cornersAway: 0
    };

    const result = await pool.query(
      `
      INSERT INTO matches (
        id,
        competition,
        home,
        away,
        home_flag,
        away_flag,
        match_date,
        match_time,
        status,
        minute,
        score_home,
        score_away,
        stoppage,
        favorite,
        stats
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        'scheduled',
        0,
        0,
        0,
        0,
        false,
        $9::jsonb
      )
      RETURNING *
      `,
      [
        id,
        competition,
        home,
        away,
        home_flag || "⚽",
        away_flag || "⚽",
        match_date,
        match_time,
        JSON.stringify(stats)
      ]
    );

    res.status(201).json({
      ok: true,
      match: result.rows[0]
    });
  } catch (error) {
    console.error("CREATE MATCH ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.put("/api/matches/:id", async (req, res) => {
  try {
    const {
      competition,
      home,
      away,
      home_flag,
      away_flag,
      match_date,
      match_time,
      status,
      minute,
      score_home,
      score_away,
      stoppage,
      favorite,
      stats
    } = req.body;

    const result = await pool.query(
      `
      UPDATE matches
      SET
        competition = COALESCE($1, competition),
        home = COALESCE($2, home),
        away = COALESCE($3, away),
        home_flag = COALESCE($4, home_flag),
        away_flag = COALESCE($5, away_flag),
        match_date = COALESCE($6, match_date),
        match_time = COALESCE($7, match_time),
        status = COALESCE($8, status),
        minute = COALESCE($9, minute),
        score_home = COALESCE($10, score_home),
        score_away = COALESCE($11, score_away),
        stoppage = COALESCE($12, stoppage),
        favorite = COALESCE($13, favorite),
        stats = COALESCE($14::jsonb, stats)
      WHERE id = $15
      RETURNING *
      `,
      [
        competition ?? null,
        home ?? null,
        away ?? null,
        home_flag ?? null,
        away_flag ?? null,
        match_date ?? null,
        match_time ?? null,
        status ?? null,
        minute ?? null,
        score_home ?? null,
        score_away ?? null,
        stoppage ?? null,
        favorite ?? null,
        stats ? JSON.stringify(stats) : null,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Match not found."
      });
    }

    res.json({
      ok: true,
      match: result.rows[0]
    });
  } catch (error) {
    console.error("UPDATE MATCH ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.delete("/api/matches/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      DELETE FROM matches
      WHERE id = $1
      RETURNING id
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Match not found."
      });
    }

    res.json({
      ok: true,
      deleted: result.rows[0].id
    });
  } catch (error) {
    console.error("DELETE MATCH ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* ===============================
   EVENTS
=============================== */

app.get("/api/matches/:id/events", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM events
      WHERE match_id = $1
      ORDER BY minute ASC, created_at ASC
      `,
      [req.params.id]
    );

    res.json({
      ok: true,
      events: result.rows
    });
  } catch (error) {
    console.error("GET EVENTS ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* ===============================
   NEWS
=============================== */

/*
   GET ALL NEWS
*/

app.get("/api/news", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        category,
        title,
        description,
        content,
        featured,
        author,
        created_at,
        updated_at
      FROM news
      ORDER BY featured DESC, created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("GET NEWS ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/*
   GET ONE NEWS ARTICLE
*/

app.get("/api/news/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        category,
        title,
        description,
        content,
        featured,
        author,
        created_at,
        updated_at
      FROM news
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "News article not found."
      });
    }

    res.json({
      ok: true,
      article: result.rows[0]
    });
  } catch (error) {
    console.error("GET NEWS ARTICLE ERROR:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* ===============================
   HEALTH
=============================== */

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      server: "online",
      database: "online"
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      server: "online",
      database: "offline",
      error: error.message
    });
  }
});

/* ===============================
   START
=============================== */

app.listen(PORT, () => {
  console.log("");
  console.log("=================================");
  console.log("       MEFCO WATCH SERVER");
  console.log("=================================");
  console.log(`Website: http://localhost:${PORT}`);
  console.log(`API:     http://localhost:${PORT}/api`);
  console.log("Database: Connected through Supabase");
  console.log("News API: /api/news");
  console.log("=================================");
  console.log("");
});