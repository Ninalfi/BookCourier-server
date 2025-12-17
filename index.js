const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');
const { default: verifyFirebaseToken } = require("./middlewares/verifyFirebaseToken");

const PORT = process.env.PORT || 3000;

require('dotenv').config();

//middlewares
app.use(cors({
  origin: [
    'http://localhost:5173',
    ],
  credentials: true
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kpqz2hg.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const db = client.db('book_courier_dB');
    usersCollection = db.collection('users');
    booksCollection = db.collection('books');
    ordersCollection = db.collection('orders');

//user api
   app.get('/users', verifyFirebaseToken, async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.json(users);
});

    app.post('/users', async (req, res) => {
  const user = req.body;
  const existing = await usersCollection.findOne({ email: user.email });
  if (existing) return res.json({ message: 'User already exists' });
  const result = await usersCollection.insertOne(user);
  res.json(result);
});

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

    await client.close();
  }
}
run().catch(console.dir);


app.get("/", (req, res) =>{
    res.send("BookCourier API Running")
});

app.listen(PORT, () =>{
     console.log(`Server running on port ${PORT}`)
    });