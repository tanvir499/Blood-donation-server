const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRETE);
const crypto = require('crypto')

const app = express();
app.use(cors());
app.use(express.json())


const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const verifyFbToken = async (req, res, next) => {
  const token = req.headers.authorization
  if (!token) {
    return res.status(401).send({ message: 'unauthorize access' })
  }

  try {
    const idToken = token.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(idToken)
    console.log('decoded info', decoded)
    req.decoded_email = decoded.email
    next()
  }
  catch (error) {
    return res.status(401).send({ message: 'unauthorize access' })
  }
}


const uri = "mongodb+srv://missionscic11:zY19HtqaujWULtQt@cluster0.1zpt75e.mongodb.net/?appName=Cluster0";

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    //save photoUrl to database
    const database = client.db('missionscic11DB');
    const userCollections = database.collection('user');
    const requestsCollections = database.collection('request');

    app.post('/users', async (req, res)=>{
       const userInfo = req.body;
       userInfo.createdAt = new Date();
       userInfo.role = 'donor';
       userInfo.status = 'active'
       const result = await userCollections.insertOne(userInfo);
       res.send(result);
    })

    //for all-users
    app.get('/users', verifyFbToken, async(req,res)=>{
      const result = await userCollections.find().toArray();
      res.status(200).send(result)
    })

    //for login user
    app.get('/users/role/:email', async (req,res)=>{
       const {email} = req.params;
       console.log(email);
       
       const query = {email: email}
       const result = await userCollections.findOne(query);
       console.log(result);
       res.send(result);
    })

     app.patch('/update/user/status', verifyFbToken, async (req,res)=>{
        const {email , status} = req.query;
        const query =  {email: email};

        const updateStatus = {
          $set: {
            status: status
          }
        }

        const result = await userCollections.updateOne(query, updateStatus)
        res.send(result);
     })

    //Requests
    app.post('/requests', verifyFbToken, async(req,res)=>{
       const data = req.body;
       data.createdAt = new Date();
       const result = await requestsCollections.insertOne(data)
       res.send(result);
    })

   //for my-request
   app.get('/my-request', verifyFbToken, async(req,res)=>{
      const email = req.decoded_email;
      const size = Number(req.query.size);
      const page = Number(req.query.page)


      const query = {requesterEmail : email};

      const result = await requestsCollections
      .find(query)
      .limit(size)
      .skip(size*page)
      .toArray();

      const totalRequest = await requestsCollections.countDocuments(query);

      res.send({request : result ,totalRequest});
   })

    //payment
     app.post('/create-payment-checkout', async (req, res) => {
      const information = req.body
      const amount = parseInt(information.donateAmount) * 100;

      

      const session = await stripe.checkout.sessions.create({

        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: amount,
              product_data: {
                name: 'Please Donate'
              }
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        metadata: {
          donorName: information?.donorName
        },
        customer_email: information?.donorEmail,
        success_url: `${process.env.SITE_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/payment-cancelled`,
      });

      res.send({ url: session.url })
    })

      app.post('/payment-success', async (req, res) => {
      const { session_id } = req.query

      const session = await stripe.checkout.sessions.retrieve(
        session_id
      );

      console.log(session)
      const transactionId = session.payment_intent
      const isPaymentExist = await paymentsCollection.findOne({ transactionId })
      if (isPaymentExist) return
      if (session.payment_status == 'paid') {
        const paymentInfo = {
          amount: session.amount_total / 100,
          currency: session.currency,
          donorEmail: session.customer_email,
          transactionId,
          payment_status: session.payment_status,
          paidAt: new Date()
        }
        const result = await paymentsCollection.insertOne(paymentInfo)
        return res.send(result)
      }

    })


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req,res) =>{
    res.send("Hello, Mission Scic")
})

app.listen(port, ()=>{
    console.log(`server is running on ${port}`);
})
