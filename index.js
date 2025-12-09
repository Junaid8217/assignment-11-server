const express = require('express');
const cors = require('cors');
const { Long } = require('mongodb');
require('dotenv').config
const port = process.env.PORT || 3000

const app = express();
app.use(cors());
app.use(express.json());





const { MongoClient, ServerApiVersion } = require('mongodb');
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

    app.post('/users', async(req,res)=>{
        const userInfo = req.body;
        userInfo.role = "buyer";
        userInfo.createdAt = new Date();

        const result = await userCollections.insertOne(userInfo);
        res.send(result)
    })

    //Api for getting current user email
    app.get('/users/role/:email', async (req, res)=> {
        const {email} = req.params
        console.log(email);
        

        const query = {email:email}
        const result = await userCollections.findOne(query)
        console.log(result);
        
        res.send(result)
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






app.get('/', (req, res)=> {
    res.send("Hello I'm Junaid this time I'm, working with assignment 11!!!");
})

app.listen(port, ()=>{
    console.log(`Server is running on ${port}`);
    
})

