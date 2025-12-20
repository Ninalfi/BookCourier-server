const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
   app.get('/users',verifyAdmin, async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.json(users);
});
app.get('/users/:email', async (req, res) => {
  const email = req.params.email;
  try {
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.patch('/users/role/:id', verifyAdmin, async (req, res) => {
  const { role } = req.body; 
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { role } }
  );
  res.json({
     success: true,
    message: `User role updated to ${role}`,
    result
  });
});


//Add book
app.post('/books',verifyLibrarian,  async (req, res) => {
  const book = { ...req.body, price: Number(req.body.price), createdAt: new Date() };
  const result = await booksCollection.insertOne(book);
  res.json(result);
});

app.get('/books', async (req, res) => {
  const { page = 1, limit = 20, search, sort } = req.query;

  let query = {}; 
  if (search) query.title = { $regex: search, $options: 'i' };

  let cursor = booksCollection.find(query);

  if (sort === 'asc') cursor.sort({ price: 1 });
  if (sort === 'desc') cursor.sort({ price: -1 });

  const skip = (parseInt(page) - 1) * parseInt(limit);
  cursor = cursor.skip(skip).limit(parseInt(limit));

  const books = await cursor.toArray();
  res.json(books);
});

app.get('/books/:id', async (req, res) => {
  const book = await booksCollection.findOne({ _id: new ObjectId(req.params.id) });
  res.json(book);
});

app.patch('/books/:id',verifyLibrarian, async (req, res) => {
  const result = await booksCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: req.body }
  );
  res.json(result);
});

app.delete('/books/:id',verifyAdmin,  async (req, res) => {
  const id = req.params.id;
  await ordersCollection.deleteMany({ bookId: id });
  const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
  res.json(result);
});

//orders api
app.post('/orders', async (req, res) => {
  const order = { ...req.body, status: 'pending', paymentStatus: 'unpaid', orderDate: new Date() };
  const result = await ordersCollection.insertOne(order);
  res.json(result);
});

app.get('/orders', async (req, res) => {
  const email = req.user.email;
  const result = await ordersCollection.find({ email }).toArray();
  res.json(result);
});

app.patch('/orders/:id', async (req, res) => {
  const result = await ordersCollection.updateOne(
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

app.get('/wishlist', async (req, res) => {
  const email = req.user.email;
   if (!email) return res.status(400).json({ error: 'Email is required' });
  const result = await wishlistCollection.find({ email }).toArray();
  res.json(result);
});

app.delete('/wishlist/:id', async (req, res) => {
  const result = await wishlistCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json(result);
});

app.post('/reviews',  async (req, res) => {
  const review = { ...req.body,email: req.user.email, createdAt: new Date() };
  const result = await reviewsCollection.insertOne(review);
  res.json(result);
});

app.get('/reviews/:bookId', async (req, res) => {
  const result = await reviewsCollection.find({ bookId: req.params.bookId }).toArray();
  res.json(result);
});

//payments api


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