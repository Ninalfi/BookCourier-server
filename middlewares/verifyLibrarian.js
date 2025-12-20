const verifyLibrarian = async (req, res, next) => {
  const user = await usersCollection.findOne({ email: req.user.email });
  if (!["admin", "librarian"].includes(user?.role)) {
    return res.status(403).json({ message: "Librarian access required" });
  }
  next();
};