const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/lamdis').then(async () => {
  const doc = await mongoose.connection.db.collection('runs').findOne({ _id: new mongoose.Types.ObjectId('6983f33183657a545638edd8') });
  console.log(JSON.stringify(doc, null, 2));
  process.exit(0);
});