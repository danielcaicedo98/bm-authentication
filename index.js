// const app = require('./app')
// app.listen(3030)
// console.log('Servidor corriendo en puerto ---> 3030',)

require('dotenv').config();
const axios = require('axios');

const express = require('express');
const admin = require('firebase-admin');
const serviceAccount = require('./firebase.json'); // Reemplaza con la ubicación de tu clave de servicio de Firebase
const bcrypt = require('bcrypt');
const cors = require('cors');

const main_route = "/bm_auth"

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount), 
});

const app = express();
const port = process.env.PORT || 3030;

const db = admin.firestore();

const promClient = require('prom-client');

const registroDeMetricas = new promClient.Registry();




// Métricas personalizadas
const totalSolicitudes = new promClient.Counter({
  name: 'total_solicitudes',
  help: 'Número total de solicitudes recibidas',
});

registroDeMetricas.registerMetric(totalSolicitudes);

app.get(main_route + '/login_metrics', async (req, res) => {
  try {
    const metrics = await registroDeMetricas.metrics();
    res.set('Content-Type', registroDeMetricas.contentType);
    res.end(metrics);
  } catch (error) {
    console.error('Error al obtener métricas:', error);
    res.status(500).send('Error al obtener métricas');
  }
});

// Incrementar el contador de solicitudes en cada llamada a la API
app.use((req, res, next) => {
  totalSolicitudes.inc();
  next();
});


// Middleware para analizar JSON en solicitudes
app.use(express.json());
app.use(cors());

// Función para encriptar una contraseña
async function encriptarContrasena(contrasena) {
  const saltRounds = 10;
  const salt = await bcrypt.genSalt(saltRounds);
  const contrasenaEncriptada = await bcrypt.hash(contrasena, salt);
  return contrasenaEncriptada;
}

// FUNCION PARA EL REGISTRO DE LOGS



function sendLog(message) {
  const indexName = 'authentication-logs'; 
  const url = `http://elasticsearch:9200/${indexName}/_doc`;

  axios.post(url, {
    message: message,
    timestamp: new Date()
  })
  .then(response => {
    console.log('Log sent:', message);
  })
  .catch(error => {
    console.error('Error sending log:', error);
  });
}

// Ejemplo de envío de logs





// Ruta para el registro de usuarios
app.post(main_route + '/registro', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Verificar si el correo ya está registrado en Firestore
    const querySnapshot = await db.collection('users').where('email', '==', email).get();

    if (!querySnapshot.empty) {
      // El correo ya está registrado
      return res.status(400).json({ success: false, error: 'El correo ya está registrado' });
    }

    // Encriptar la contraseña
    const passwordEncriptada = await encriptarContrasena(password);

    // Registra al usuario en Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password: passwordEncriptada, // Almacena la contraseña encriptada en Firebase Auth
      name,
      passwordHash: passwordEncriptada,
    });

    // Guarda los datos del usuario en Firestore
    const userRef = db.collection('users').doc(userRecord.uid);
    await userRef.set({
      name,
      email,
      password: passwordEncriptada,
      passwordHash: passwordEncriptada, // Almacena la contraseña encriptada en Firestore
    });

    res.json({ success: true, data: userRecord });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get(main_route + '/users', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();

    if (usersSnapshot.empty) {
      return res.status(404).json({ success: false, error: 'No se encontraron usuarios' });
    }

    const users = [];
    usersSnapshot.forEach((doc) => {
      users.push({
        id: doc.id,
        data: doc.data()
      });
    });
    sendLog('Se ha solicitado registro de los usuarios');
    

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});



app.post(main_route + '/create-user', async (req, res) => {
    
    try {
      const { email, name, id } = req.body;      
  
      // Verificar si el correo ya está registrado en Firestore
      const querySnapshot = await db.collection('users').where('email', '==', email).get();
  
      if (!querySnapshot.empty) {
        // El correo ya está registrado
        return res.status(400).json({ success: false, error: 'El correo ya está registrado' });
      }
  
      // Guarda los datos del usuario en Firestore
      const userRef = db.collection('users').doc(id);
      await userRef.set({
        name,
        email,
        id
            
      });
  
      res.json({ success: true, data: userRef });
    } catch (error) {
     
      res.status(500).json({ success: false, error: error.message });
    }
  });



app.post(main_route + '/login', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // Verificar si el correo es válido
      const userQuery = await db.collection('users').where('email', '==', email).get();

      if (userQuery.empty) {
        return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
      }

      // Tomar el primer resultado de la consulta
      const userDoc = userQuery.docs[0];

      // Extraer la contraseña almacenada en el documento
      const storedPassword = userDoc.get('password');

      // Comprobar la contraseña
      const contrasenaValida = await bcrypt.compare(password, storedPassword);

      if (contrasenaValida) {
        res.json({ success: true, message: 'Inicio de sesión exitoso' });
      } else {
        res.status(401).json({ success: false, error: 'Credenciales incorrectas' });
      }
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      res.status(500).json({ success: false, error: error.message });
    }
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor en funcionamiento en el puerto ${port}`);
});
