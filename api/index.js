module.exports = (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'LLM Stock Arena API'
  });
};
