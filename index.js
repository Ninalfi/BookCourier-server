require('dotenv').config();
const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const admin = require("./config/firebase");

const PORT = process.env.PORT || 3000;
const crypto = require('crypto');

//middlewares
app.use(cors({
  origin: [
    'http://localhost:5173',
    ],
  credentials: true
}));

app.use(express.json());


const verifyFirebaseToken = async (req, res, next) => {
  console.log("AUTH HEADER:", req.headers.authorization);

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;
      
    if (!token) {
      console.log("❌ NO TOKEN");
      return res.status(401).json({ message: "Unauthorized: no token" });
    }
    const decoded = await admin.auth().verifyIdToken(token);
    console.log("✅ TOKEN VERIFIED:", decoded.email);
    req.user = decoded;
    next();
  } catch (error) {
    console.log("verifyFirebaseToken error:", error.message);
    return res.status(401).json({ message: "Unauthorized: invalid token" });
  }
};

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

const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ message: "Unauthorized" });
    const dbUser = await usersCollection.findOne({ email });
    if (!dbUser) return res.status(404).json({ message: "User not found" });

    if (dbUser.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: admin only" });
    }

    next();
  } catch (err) {
    console.error("verifyAdmin error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

const verifyLibrarianOrAdmin = async (req, res, next) => {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).json({ message: "Unauthorized" });

    const user = await usersCollection.findOne({ email });
    if (!user || (user.role !== "librarian" && user.role !== "admin")) {
      return res.status(403).json({ message: "Forbidden: librarian/admin only" });
    }
    next();
  } catch (err) {
    console.error("verifyLibrarianOrAdmin error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

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

     await usersCollection.createIndex({ email: 1 }, { unique: true });
    await wishlistCollection.createIndex({ email: 1, bookId: 1 }, { unique: true });


//user api

app.post("/users", verifyFirebaseToken, async (req, res) => {
  try {
    if (!usersCollection) {
      return res.status(503).json({ success: false, message: "DB not ready" });
    }

    const email = req.user?.email;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email missing in token" });
    }

    const nameFromBody = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const nameFromToken = typeof req.user?.name === "string" ? req.user.name.trim() : "";

    const update = {
      $setOnInsert: {
        email,
        role: "user",
        createdAt: new Date(),
      },
      $set: {
        updatedAt: new Date(),
      },
    };

    const finalName = nameFromBody || nameFromToken;
    if (finalName) update.$set.name = finalName;

    const result = await usersCollection.updateOne({ email }, update, { upsert: true });

    res.json({
      success: true,
      upserted: !!result.upsertedId,
      insertedId: result.upsertedId || null,
      message: result.upsertedId ? "User created" : "User exists",
    });
  } catch (err) {
    console.error("POST /users error:", err);
    res.status(500).json({ success: false, message: err?.message || "Internal server error" });
  }
});

app.get("/users/me", verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.user.email;
    const user = await usersCollection.findOne(
      { email },
      { projection: { role: 1, email: 1, name: 1, displayName: 1 } }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("GET /me error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get('/users/:email', verifyFirebaseToken, verifyAdmin, async (req, res) => {
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

app.patch('/users/role/:id',verifyFirebaseToken, verifyAdmin, async (req, res) => {
  const { role } = req.body; 
   if (!role) return res.status(400).json({ message: "role required" });

         if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: "Invalid id" });
      }
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { role } }
      );

      res.json({ success: true, message: `User role updated to ${role}`, result });
    });


//book apis
 app.post("/books", verifyFirebaseToken, verifyLibrarianOrAdmin, async (req, res) => {
    const rawPrice = String(req.body.price ?? "").trim();
   const cleanPrice = Number(rawPrice.replace(/[^0-9.]/g, "")); 

    const image = req.body.img || req.body.image;
      const book = { ...req.body, img: image, librarianEmail: req.user.email,  price: cleanPrice, createdAt: new Date(), status: req.body.status || "published", };

      if (!book.title || !book.img || !book.author) {
        return res.status(400).json({ message: "title, image, author required" });
      }
        if (!Number.isFinite(book.price) || book.price <= 0) {
    return res.status(400).json({ message: "Invalid price" });
  }

      book.status = book.status || "published";

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

app.get("/books/:id", async (req, res) => {
  const { id } = req.params;
  const query = ObjectId.isValid(id)
    ? { $or: [{ _id: new ObjectId(id) }, { _id: id }] }
    : { _id: id };

  const book = await booksCollection.findOne(query);
  if (!book) return res.status(404).json({ message: "Book not found" });
  res.json(book);
});

app.patch('/books/:id', verifyFirebaseToken, verifyLibrarianOrAdmin, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

  const result = await booksCollection.updateOne(
    { _id: (req.params.id) },
    { $set: { ...req.body,  updatedAt: new Date()  } }
  );
  res.json(result);
});

app.delete('/books/:id',verifyFirebaseToken, verifyLibrarianOrAdmin,  async (req, res) => {
  const id = req.params.id;
  await ordersCollection.deleteMany({ bookId: id });
  const result = await booksCollection.deleteOne({ _id: id });
  res.json(result);
});

app.get("/librarian/books", verifyFirebaseToken, verifyLibrarianOrAdmin, async (req, res) => {
  const email = req.user.email;
  const books = await booksCollection
    .find({ postedBy: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.json(books);
});


//orders api
app.post("/orders", verifyFirebaseToken, async (req, res) => {
    try {
          const { bookId, address, phone, name } = req.body;

    if (!ObjectId.isValid(bookId)) {
      return res.status(400).json({ message: "Invalid bookId" });
    }

    const book = await booksCollection.findOne({ _id: bookId });
    if (!book) return res.status(404).json({ message: "Book not found" });

    const rawPrice = String(req.body.price ?? "").trim();
    const price = Number(rawPrice.replace(/[^0-9.]/g, ""));
    const quantity = Number(req.body.quantity || 1);

    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "Invalid price", rawPrice });
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      return res.status(400).json({ message: "Invalid quantity" });
    }
    
    const librarianEmail =
       book.postedBy || book.librarianEmail || req.body.librarianEmail || "";

  const order = {

    email: req.user.email,
    userEmail: req.user.email,
    bookId: book._id.toString(),
    bookTitle: book.title || req.body.bookTitle || "",
    bookImage: book.img || book.image || req.body.bookImage || "",
    bookAuthor: book.author || "",
    category: book.category || "",
    librarianEmail,
    price,
    quantity,
    orderStatus: "pending", 
    paymentStatus: "unpaid",
    createdAt: new Date(),
    address: address || "",
    phone: phone || "",
    name: name || "",
  };

  const result = await ordersCollection.insertOne(order);
  res.json({ success: true, insertedId: result.insertedId });
}catch (err) {
    console.error("POST /orders error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get('/orders/my',verifyFirebaseToken, async (req, res) => {
  const email = req.user.email;

    const orders = await ordersCollection
    .find({ $or: [{ email }, { userEmail: email }] })
    .sort({ createdAt: -1 })
    .toArray();
      const normalized = orders.map((o) => ({
    ...o,
    orderStatus: o.orderStatus || o.status || "pending",
  }));
  res.json(normalized);
});

app.patch("/orders/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

    const email = req.user.email;
    const order = await ordersCollection.findOne({ _id: new ObjectId(id), email });
    if (!order) return res.status(404).json({ message: "Order not found" });
    if ((order.orderStatus || order.status) !== "pending") {
      return res.status(400).json({ message: "Only pending orders can be cancelled" });
    }

    await ordersCollection.updateOne(
      { _id: order._id  },
      { $set: { orderStatus: "cancelled" } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /orders/:id/cancel error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/librarian/orders", verifyFirebaseToken, verifyLibrarianOrAdmin, async (req, res) => {
  const email = req.user.email;

  const orders = await ordersCollection
    .find({ librarianEmail: email })
    .sort({ createdAt: -1 })
    .toArray();

  res.json(orders);
});
app.patch(
  "/librarian/orders/:id/status",
  verifyFirebaseToken,
  verifyLibrarianOrAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const { orderStatus } = req.body;
      const allowed = ["pending", "shipped", "delivered", "cancelled"];
      if (!allowed.includes(orderStatus)) {
        return res.status(400).json({ message: "Invalid orderStatus" });
      }

      const librarianEmail = req.user.email;

      const order = await ordersCollection.findOne({
        _id: new ObjectId(id),
        librarianEmail,
      });

      if (!order) return res.status(404).json({ message: "Order not found" });

      await ordersCollection.updateOne(
        { _id: order._id },
        { $set: { orderStatus } }
      );

      res.json({ success: true });
    } catch (err) {
      console.error("PATCH /librarian/orders/:id/status error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

app.patch(
  "/librarian/orders/:id/cancel",
  verifyFirebaseToken,
  verifyLibrarianOrAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid id" });
      }

      const librarianEmail = req.user.email;

      const order = await ordersCollection.findOne({
        _id: new ObjectId(id),
        librarianEmail,
      });

      if (!order) return res.status(404).json({ message: "Order not found" });

      if ((order.orderStatus || "pending") !== "pending") {
        return res.status(400).json({ message: "Only pending orders can be cancelled" });
      }

      await ordersCollection.updateOne(
        { _id: order._id },
        { $set: { orderStatus: "cancelled" } }
      );

      res.json({ success: true });
    } catch (err) {
      console.error("PATCH /librarian/orders/:id/cancel error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);


// Add to wishlist
app.post("/wishlist", verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.user.email;
    const { bookId } = req.body;

    if (!bookId) return res.status(400).json({ message: "bookId required" });

    let book = null;
    if (ObjectId.isValid(bookId)) {
      book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
    }
    if (!book) {
      book = await booksCollection.findOne({ _id: bookId });
    }
    if (!book) return res.status(404).json({ message: "Book not found" });

    const doc = {
      email,
      bookId: String(book._id),
      title: book.title || "",
      author: book.author || "",
      img: book.img || book.image || "",
      price: book.price ?? 0,
      category: book.category || "",
      createdAt: new Date(),
    };
    const exists = await wishlistCollection.findOne({ email, bookId: doc.bookId });
    if (exists) {
      return res.json({ success: true, message: "Already wishlisted", item: exists });
    }
    const result = await wishlistCollection.insertOne(doc);
    res.json({ success: true, insertedId: result.insertedId, item: doc });
  } catch (err) {
    console.error("POST /wishlist error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.get("/wishlist", verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.user.email;

    const items = await wishlistCollection
      .find({ email })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(items);
  } catch (err) {
    console.error("GET /wishlist error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/wishlist/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.user.email;
    const { id } = req.params;

    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
    const result = await wishlistCollection.deleteOne({
      _id: new ObjectId(id),
      email, 
    });
    if (!result.deletedCount) {
      return res.status(404).json({ message: "Wishlist item not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /wishlist/:id error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.post("/reviews", verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.user.email;
    const { bookId, rating, review } = req.body;

    if (!bookId || !rating) {
      return res.status(400).json({ message: "bookId and rating required" });
    }
    const ordered = await ordersCollection.findOne({
      email,
      bookId: String(bookId),
      orderStatus: { $ne: "cancelled" },
    });
    if (!ordered) {
      return res.status(403).json({
        message: "You must order this book before reviewing",
      });
    }
    const doc = {
      bookId: String(bookId),
      email,
      rating: Number(rating),
      review: review || "",
      createdAt: new Date(),
    };

    const result = await reviewsCollection.insertOne(doc);
    res.json({ success: true, insertedId: result.insertedId, review: doc });
  } catch (err) {
    console.error("POST /reviews error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.get("/reviews/eligibility/:bookId", verifyFirebaseToken, async (req, res) => {
  try {
    const email = req.user.email;
    const { bookId } = req.params;

    const ordered = await ordersCollection.findOne({
      email,
      bookId: String(bookId),
      orderStatus: { $ne: "cancelled" },
    });

    res.json({ canReview: !!ordered });
  } catch (err) {
    console.error("GET /reviews/eligibility error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

//admin only

 app.get("/users", verifyFirebaseToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.json(users);
    });

 app.get("/manage-books",verifyFirebaseToken, verifyAdmin, async (req, res) => {
    const books = await booksCollection.find().toArray();
    res.json(books);
  }
);

app.get("/admin/books", verifyFirebaseToken, verifyAdmin, async (req, res) => {
  const books = await booksCollection.find().toArray();
  res.json(books);
});

app.patch("/admin/books/:id/status", verifyFirebaseToken,  verifyAdmin, async (req, res) => {
   const id = req.params.id;
  const { status } = req.body;

  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
  if (!["published", "unpublished"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const result = await booksCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status, updatedAt: new Date() } }
  );

  if (!result.matchedCount) return res.status(404).json({ message: "Book not found" });
  res.json({ success: true });
});

app.delete("/admin/books/:id", verifyFirebaseToken, verifyAdmin, async (req, res) => {
   const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

  const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
  await ordersCollection.deleteMany({ bookId: id }); 

  if (!result.deletedCount) return res.status(404).json({ message: "Book not found" });
  res.json({ success: true });
});

//payments api

app.post("/payments", verifyFirebaseToken, async (req, res) => {
  const { orderId, paymentId } = req.body;

  if (!ObjectId.isValid(orderId)) {
    return res.status(400).json({ message: "Invalid orderId" });
  }

  const order = await ordersCollection.findOne({
    _id: new ObjectId(orderId),
    email: req.user.email,
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  if (order.paymentStatus === "paid") {
    return res.status(400).json({ message: "Already paid" });
  }

const unitPrice = Number(String(order.price ?? "").replace(/[^0-9.]/g, ""));
const qty = Number(order.quantity || 1);
const amount = unitPrice * qty;

if (!Number.isFinite(amount) || amount <= 0) {
  return res.status(400).json({
    message: "Invalid order price/quantity. Cannot calculate amount.",
    debug: { price: order.price, quantity: order.quantity },
  });
}

  await ordersCollection.updateOne(
    { _id: order._id },
    { $set: { paymentStatus: "paid" } }
  );

  const paymentDoc = {
    orderId,
    email: req.user.email,
    paymentId,
    amount,
    bookTitle: order.bookTitle,
    date: new Date(),
  };

  await paymentsCollection.insertOne(paymentDoc);

  res.json({ success: true, amount });
});


app.get("/payments/my", verifyFirebaseToken, async (req, res) => {
  const payments = await paymentsCollection
    .find({ email: req.user.email })
    .sort({ date: -1 })
    .toArray();

  res.json({ success: true, payments });
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