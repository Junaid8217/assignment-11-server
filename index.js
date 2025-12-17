const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const cors = require('cors');
const { Long } = require('mongodb');
require('dotenv').config()
const port = process.env.PORT || 3000
//stripe require
const stripe = require('stripe')(process.env.STRIPE_SECRET)
//stripe configure
const crypto = require('crypto')

const app = express();
app.use(cors());
app.use(express.json());


const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" })
  }

  try {
    const idToken = token.split(' ')[1]
    const decoded = await admin.auth().verifyIdToken(idToken)
    console.log("Decoded Info", decoded)
    req.decoded_email = decoded.email;
    next();
  }
  catch (error) {
    return res.status(401).send({ message: "Unauthorized access" })
  }
}



const uri = "mongodb+srv://missionscic11:zq89v1KE8H6a7KT7@cluster0.gv2lthx.mongodb.net/?appName=Cluster0";

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

    const database = client.db('missionscic11DB')
    const userCollections = database.collection('user')
    const requestCollections = database.collection('request')
    const paymentCollections = database.collection('payment')

    //save user
    app.post('/users', async (req, res) => {
      const userInfo = req.body;
      userInfo.createdAt = new Date();
      userInfo.role = 'Donor';
      userInfo.status = 'active';
      const result = await userCollections.insertOne(userInfo);
      res.send(result)
    })

    app.get('/users', verifyFBToken, async (req, res) => {
      const result = await userCollections.find().toArray()
      res.status(200).send(result)
    })

    //Api for getting current user email
    app.get('/users/role/:email', async (req, res) => {
      const { email } = req.params
      console.log(email);


      const query = { email: email }
      const result = await userCollections.findOne(query)
      console.log(result);

      res.send(result)
    })

    app.patch('/update/user/status', verifyFBToken, async (req, res) => {
      const { email, status } = req.query
      const query = { email: email }

      const updateStatus = {
        $set: {
          status: status
        }
      }
      const result = await userCollections.updateOne(query, updateStatus)
      res.send(result)
    })


    //ADD REQUEST
    app.post('/request', verifyFBToken, async (req, res) => {
      const data = req.body;
      data.createdAt = new Date();
      const result = await requestCollections.insertOne(data)

      res.send(result)
    })

    // //for getting manager email
    // app.get('/manager/products/:email', async (req, res) => {
    //   const email = req.params.email
    //   const query = { productManagerEmail: email }

    //   const result = await productCollections.find(query).toArray()
    //   res.send(result);
    // })




    //for getting user info (Profile Section)
    app.get('/user-profile', verifyFBToken, async (req, res) => {
      const email = req.decoded_email
      const query = { email: email }
      const result = await userCollections.findOne(query)
      res.send(result)
    })

    app.put('/user-profile', verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const updatedData = req.body;

        delete updatedData.email; // never update email
        delete updatedData._id;

        const result = await userCollections.updateOne(
          { email },
          { $set: updatedData }
        );

        res.send(result);
      } catch (error) {
        console.error("Profile update error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });






    //for getting one's request
    app.get('/my-request', verifyFBToken, async (req, res) => {
      const email = req.decoded_email
      const size = Number(req.query.size)
      const page = Number(req.query.page)


      const query = { requesterEmail: email }

      const result = await requestCollections
        .find(query)
        .limit(size)
        .skip(size * page)
        .toArray()

      const totalRequest = await requestCollections.countDocuments(query)

      //size=10; for second page = 1*10; third page=2*10= 20

      res.send({ request: result, totalRequest })
    })


    //search
    app.get('/search-request', async(req, res)=>{
      const {blood, district, upazila} = req.query;

      const query = {};
      if(!query){
        return 
      }
      if(blood){
        const fixed = blood.replace(/ /g,"+").trim();
        query.blood = fixed
      }
      if(district){
        query.district = district;
      }
      if(upazila){
        query.upazila = upazila;
      }

      const result = await requestCollections.find(query).toArray();
      res.send(result)
      
      

    })



    //payments
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
    //for payment info stripe
    app.post('/success-payment', async (req, res) => {
      const { session_id } = req.query
      const session = await stripe.checkout.sessions.retrieve(
        session_id
      );
      console.log(session);

      const transactionId = session.payment_intent;

      if(session.payment_status=='paid'){
        const paymentInfo = {
          amount: session.amount_total/100,
          currency:session.currency,
          donorEmail: session.customer_email,
          transactionId,
          paymentStatus: session.payment_status,
          paidAt: new Date()
        }

        const result= await paymentCollections.insertOne(paymentInfo)
        return res.send(paymentInfo)
      }
      

    })






    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);






app.get('/', (req, res) => {
  res.send("Hello I'm Junaid this time I'm, working with assignment 11!!!");
})

app.listen(port, () => {
  console.log(`Server is running on ${port}`);

})

