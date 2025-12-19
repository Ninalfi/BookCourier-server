const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require('mongodb');
//const verifyFirebaseToken  = require("./middlewares/verifyFirebaseToken");

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

let usersCollection;
let booksCollection;
let ordersCollection;
let wishlistCollection;
let reviewsCollection;
let paymentsCollection;

async function run() {
  try {
    await client.connect();

    const db = client.db('book_courier_dB');
    usersCollection = db.collection('users');
    booksCollection = db.collection('books');
    ordersCollection = db.collection('orders');
    wishlistCollection = db.collection('wishlist');
    reviewsCollection = db.collection('reviews');
    paymentsCollection = db.collection('payments');

//user api

app.post('/users', async (req, res) => {
  const user = req.body;
  const existing = await usersCollection.findOne({ email: user.email });
  if (existing) return res.json({ message: 'User already exists' });
  const result = await usersCollection.insertOne(user);
  res.json(result);
});
   app.get('/users', async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.json(users);
});


//Add book
app.post('/books',  async (req, res) => {
  const book = { ...req.body, createdAt: new Date() };
  const result = await booksCollection.insertOne(book);
  res.json(result);
});

// Get all books
app.get('/books', async (req, res) => {
  const { search, sort } = req.query;
  let query = { status: 'published' };
  if (search) query.title = { $regex: search, $options: 'i' };
  let cursor = booksCollection.find(query);
  if (sort === 'asc') cursor.sort({ price: 1 });
  if (sort === 'desc') cursor.sort({ price: -1 });
  res.json(await cursor.toArray());
});

// Get book by ID
app.get('/books/:id', async (req, res) => {
  const book = await booksCollection.findOne({ _id: new ObjectId(req.params.id) });
  res.json(book);
});

// Update book
app.patch('/books/:id', async (req, res) => {
  const result = await booksCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.json(result);
});

// Add to wishlist
app.post('/wishlist',  async (req, res) => {
  const result = await wishlistCollection.insertOne(req.body);
  res.json(result);
});

// Get wishlist
app.get('/wishlist', async (req, res) => {
  const email = req.user.email;
  const result = await wishlistCollection.find({ email }).toArray();
  res.json(result);
});

// Remove from wishlist
app.delete('/wishlist/:id', async (req, res) => {
  const result = await wishlistCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json(result);
});

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  }
   finally {

  }
}
run().catch(console.dir);


app.get("/", (req, res) =>{
    res.send("BookCourier API Running")
});

app.listen(PORT, () =>{
     console.log(`Server running on port ${PORT}`)
    });