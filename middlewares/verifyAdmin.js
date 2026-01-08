const verifyAdmin = async (req, res, next) => {
  const email = req.decoded_email;
  const query = {  email };
  const user = await userCollection.findOne(query);

  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: admin only" });
  }
  next();
};
