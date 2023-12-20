# Use una imagen base de Node.js
FROM node:latest

# Establece el directorio de trabajo en /app
WORKDIR /app

# Copia los archivos de tu aplicación al directorio de trabajo
COPY package*.json ./
COPY index.js ./
COPY firebase.json ./
COPY .env ./

# Instala las dependencias de tu aplicación
RUN npm install

# Expón el puerto en el que se ejecutará tu aplicación
EXPOSE 3030

# Inicia tu aplicación cuando se ejecute el contenedor
CMD [ "node", "index.js" ]
