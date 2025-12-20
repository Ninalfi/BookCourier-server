const verifyAdmin = async (req, res, next) => {
  const email = req.user.email;
  const user = await usersCollection.findOne({ email });

  if (user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};
