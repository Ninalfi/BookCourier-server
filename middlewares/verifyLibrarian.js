const verifyLibrarian = async (req, res, next) => {
  const role = req.dbUser?.role;
  if (role !== "librarian" && role !== "admin") {
    return res.status(403).json({ message: "Forbidden: librarian/admin only" });
  }
  next();
};