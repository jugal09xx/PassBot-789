// import modules
import inquirer from "inquirer";
import fs from "fs";
import crypto from "crypto";
import clipboardy from "clipboardy";
import argon2 from "argon2";
import base85 from "base85";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

// dotenv configuration
dotenv.config();

// global variables
let masterPassword;
let currentIV;
let currentDB;
let entries = [];
let connection = null;
let imageHash;
let imagePath;
let userName;
let websiteName;
let hashLen;
let salt;

// Initialize the application
welcomeMenu();

// function to render welcome menu
async function welcomeMenu() {
  console.log();
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "PassBot - An Image-based Password Generator & Manager",
      choices: [
        "Password Generator (Argon2)",
        "Password Manager (AES-256-CBC)",
        "Help",
        "Exit",
      ],
    },
  ]);

  switch (choice) {
    case "Password Manager (AES-256-CBC)":
      await passwordManagerMenu();
      break;
    case "Password Generator (Argon2)":
      await passwordGeneratorMenu();
      break;
    case "Exit":
      console.log("Exiting...");
      break;
    case "Help":
      await showHelpMenu();
      break;
    default:
      console.log("Invalid choice!");
      welcomeMenu();
  }
}

//PASSWORD GENERATOR MENU
async function passwordGeneratorMenu() {
  console.log();
  const { choice } = await inquirer.prompt({
    type: "list",
    name: "choice",
    message: "PassBot's Image-based Password Generator",
    choices: ["Generate Credentials", "Manage Credentials", "Back", "Exit"],
  });

  switch (choice) {
    case "Generate Credentials":
      await generateCredentials();
      break;
    case "Manage Credentials":
      await manageCredentials();
      break;
    case "Back":
      await welcomeMenu();
      break;
    case "Exit":
      console.log("Exiting...");
      break;
    default:
      console.log("Invalid Choice!");
      passwordGeneratorMenu();
  }
}

//FUNCTION TO GENERATE CREDENTIALS WITH ARGON2
async function generateCredentials() {
  const { websiteName, userName, imagePath, masterPassword, hashLen } =
    await inquirer.prompt([
      {
        type: "input",
        name: "websiteName",
        message: "Enter Website Name:",
      },
      {
        type: "input",
        name: "userName",
        message: "Enter username:",
      },
      {
        type: "input",
        name: "imagePath",
        message: "Enter Path to Image:",
      },
      {
        type: "password",
        name: "masterPassword",
        message:
          "Choose a Master Password. You must remember this password to access your credentials again:",
      },
      {
        type: "input",
        name: "hashLen",
        message: "Enter your preferred password length [8-64]:",
      },
    ]);

  //hash image
  imageHash = hashImage(imagePath);
  //console.log('Hash: '+imageHash)
  //generate metadata salt
  salt = Buffer.concat([
    Buffer.from(websiteName),
    Buffer.from(imageHash),
    Buffer.from(userName),
  ]);
  //console.log("salt: " + salt);

  const passwordHash = await argon2.hash(masterPassword, { salt: salt });
  const finalHash = passwordHash.substring(31);
  //console.log()
  //console.log('argon hash: '+finalHash);

  const encodedPassword = base85.encode(finalHash, "ascii85");
  //console.log(encodedPassword)

  const finalPassword = encodedPassword.substring(
    encodedPassword.length - hashLen
  );

  //console.log(finalPassword)

  //copy to clipboard
  clipboardy.writeSync(finalPassword);
  //console.log(finalPassword)
  console.log();
  console.log(
    "Password Generated: " + finalPassword + " \n[Copied to Clipboard!]"
  );

  // Create a JSON object to store the parameters
  const credentialData = {
    imageHash,
    websiteName,
    userName,
    passwordLength: hashLen,
  };

  try {
    // Specify the desired JSON file path
    const filePath = "config.json";

    // Read existing data (if any)
    let existingData;
    try {
      existingData = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      // Handle potential errors like a missing file gracefully (optional)
      existingData = []; // Consider initializing with an empty array
    }

    // Append new data to the existing array
    existingData.push(credentialData);

    // Write the updated data to the JSON file
    fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));

    console.log("Parameters saved to:", filePath);
  } catch (error) {
    console.error("Error saving data to JSON file:", error);
  }
  passwordGeneratorMenu();
}

//FUNCTION TO READ config.json, DISPLAY ENTRIES AND COPY SELECTED PASSWORDS TO CLIPBOARD
async function manageCredentials() {
  // Specify the JSON file path
  const filePath = "config.json";

  // Read the JSON data
  const jsonData = JSON.parse(fs.readFileSync(filePath, "utf8"));

  try {
    // Check if data is empty
    if (!jsonData.length) {
      console.log("No credentials exist!");
      passwordGeneratorMenu();
    }

    // Table data with index
    const tableData = jsonData.map((credential, index) => ({
      index: index + 1,
      // Exclude imageHash
      websiteName: credential.websiteName,
      userName: credential.userName,
      passwordLength: credential.passwordLength,
    }));

    console.log();
    console.log("------------------------Credentials------------------------");

    // Table headers
    console.table([
      ...tableData, // Spread operator to add each credential object as a table row
    ]);
  } catch (error) {
    console.error("Error reading data from JSON file:", error);
  }

  const { copyPassword } = await inquirer.prompt([
    {
      type: "confirm",
      name: "copyPassword",
      message: "Do you want to copy a password to clipboard?",
    },
  ]);

  if (copyPassword) {
    const { entryIndex } = await inquirer.prompt([
      {
        type: "number",
        name: "entryIndex",
        message: "Enter the index of the entry to copy:",
        validate: (input) => {
          const index = parseInt(input);
          return !isNaN(index) && index >= 1 && index <= jsonData.length;
        },
      },
    ]);

    const selectedEntry = jsonData[entryIndex - 1];

    if (selectedEntry) {
      // console.log(selectedEntry);
      console.log();

      const { newMasterPassword } = await inquirer.prompt([
        {
          type: "password",
          name: "newMasterPassword",
          message: "Please Enter your Master Password:",
        },
      ]);

      //generate metadata salt
      salt = Buffer.concat([
        Buffer.from(selectedEntry.websiteName),
        Buffer.from(selectedEntry.imageHash),
        Buffer.from(selectedEntry.userName),
      ]);

      const passwordHash = await argon2.hash(newMasterPassword, { salt: salt });
      const finalHash = passwordHash.substring(31);
      //console.log();
      //console.log("argon hash: " + finalHash);

      const encodedPassword = base85.encode(finalHash, "ascii85");
      //console.log("encoded password: " + encodedPassword);

      const finalPassword = encodedPassword.substring(
        encodedPassword.length - selectedEntry.passwordLength
      );

      //console.log("final: " + finalPassword);

      console.log();
      console.log("Match Verified ✅");
      //copy to clipboard
      clipboardy.writeSync(finalPassword);
      //console.log(finalPassword)
      console.log("Password Copied to Clipboard! [Expires in 10s]");
      await new Promise((resolve) => setTimeout(resolve, 10000));
      clipboardy.writeSync("");

      //   try {
      //     if (argon2.verify(passwordHash, masterPassword, { salt: salt })) {
      //     } else {
      //       console.log("Invalid Master Password, Try again!");
      //       passwordManagerMenu();
      //     }
      //   } catch (err) {
      //     //console.error(err);
      //     passwordManagerMenu();
      //   }
      passwordGeneratorMenu();
    } else {
      console.log("Invalid entry index.");
    }
  } else {
    passwordGeneratorMenu();
  }
  //passwordGeneratorMenu();
}

// Encryption function to encrypt data
function encrypt(data, masterPassword) {
  const key = crypto.createHash("sha256").update(masterPassword).digest("hex");
  //console.log("key: (MasPswd + img) " + key);
  const iv = crypto.randomBytes(16);
  currentIV = iv;
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "hex"),
    iv
  );
  let encrypted = cipher.update(data, "utf-8", "hex");
  encrypted += cipher.final("hex");
  return { iv: iv.toString("hex"), encryptedData: encrypted };
}

// Encryption function for an existing file
function encryptExistingFile(data, masterPassword, iv) {
  try {
    const key = crypto
      .createHash("sha256")
      .update(masterPassword)
      .digest("hex");
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(key, "hex"),
      Buffer.from(iv, "hex")
    );
    let encrypted = cipher.update(data, "utf-8", "hex");
    encrypted += cipher.final("hex");
    return encrypted;
  } catch (error) {
    console.error("Error encrypting existing file:", error.message);
    throw error;
  }
}

// Save the encrypted database to a file
// Save the encrypted database to a file
async function saveSqlDatabase() {
  try {
    const encrypted_data = encryptExistingFile(
      JSON.stringify(entries),
      masterPassword + imageHash,
      currentIV
    );

    /*
    const writeData = `IV,EncryptedData\n${currentIV.toString(
      "hex"
    )},${encryptedData}`;
    fs.writeFileSync(`./${currentDB}.csv`, writeData, "utf-8");
    */

    //overwrite all entries in the db with the updated record (as single operation)
    console.log("currentDB value: ", currentDB);
    await connection.beginTransaction();
    await connection.query(`DELETE FROM encrypted_data`);
    const insertSql = `INSERT INTO encrypted_data (iv, encrypted_data) VALUES (?, ?)`;
    await connection.query(insertSql, [
      currentIV.toString("hex"),
      encrypted_data,
    ]);
    await connection.commit();

    console.log(`${currentDB} saved successfully!`);
    passwordVaultMenu();
  } catch (error) {
    console.error("Error saving the database:", error.message);
    passwordVaultMenu();
  }
}

// Decryption function to decrypt data
function decrypt(data, masterPassword, iv) {
  const key = crypto.createHash("sha256").update(masterPassword).digest("hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "hex"),
    Buffer.from(iv, "hex")
  );
  let decrypted = decipher.update(data, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

//Function to return image hash from image path
function getImgHash(imagePath) {
  // Read the image file from the provided path
  if (fs.existsSync(imagePath)) {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      imageHash = hashImage(imageBuffer);

      // To be deleted, for testing purpose only
      console.log("Hash: ", imageHash);

      console.log("The image has been processed successfully.");
      return imageHash; // The hashed image data can be used as a salt
    } catch (error) {
      console.error("An error occurred while processing the image:", error);
      throw error; // Rethrow the error for the caller to handle
    }
  }
  return "The file path does not exist. Please enter a valid path.";
}

// Newly added, function to hash image
function hashImage(imageBuffer) {
  const hash = crypto.createHash("sha256");
  hash.update(imageBuffer);
  return hash.digest("hex");
}

// // Newly added, function for image upload
// async function imageUpload() {
//   const { imagePath } = await inquirer.prompt([
//     {
//       type: 'input',
//       name: 'imagePath',
//       message: "Please enter the image path to finish upload:",
//       validate: input => {

//         if (fs.existsSync(input)) {
//           return true;
//         }
//         return 'The file path does not exist. Please enter a vlid path.'
//       }
//     },
//   ]);

//     // Read the image file from the provided path
//     try {
//       const imageBuffer = fs.readFileSync(imagePath);
//       imageHash = hashImage(imageBuffer);

//       // To be deleted, for testing purpose only
//       console.log("Hash: ", imageHash);

//       console.log('The image has been processed successfully.');
//       return imageHash; // The hashed image data can be used as a salt
//     } catch (error) {
//       console.error('An error occurred while processing the image:', error);
//       throw error; // Rethrow the error for the caller to handle
//     }

//   } // End of imageUpload()

// Main menu for the application
async function passwordManagerMenu() {
  //console.log();
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "PassBot-789 - A Secure Password Manager",
      choices: [
        "Open Existing Database",
        "Create New Database",
        "Back",
        "Exit",
      ],
    },
  ]);

  switch (choice) {
    case "Create New Database":
      await createDatabase();
      break;
    case "Open Existing Database":
      await openSqlDatabase();
      break;
    case "Exit":
      if (connection) {
        await connection.end();
      }
      console.log("Exiting...");
      break;
    case "Back":
      await welcomeMenu();
      break;
    default:
      console.log("Invalid choice!");
      passwordManagerMenu();
  }
}

// Function to create a new password database
async function createDatabase() {
  masterPassword = "";
  imagePath = "";
  currentIV = "";
  currentDB = "";
  entries = [];
  const {
    dbName,
    masterPassword: userMasterPassword,
    imagePath: userImagePath,
  } = await inquirer.prompt([
    {
      type: "input",
      name: "dbName",
      message: "Enter DB name: ",
    },
    {
      type: "password",
      name: "masterPassword",
      message: "Set a new master password: ",
    },
    {
      type: "input",
      name: "imagePath",
      message: "Enter image path: ",
    },
  ]);

  masterPassword = userMasterPassword;
  imagePath = userImagePath;

  if (!masterPassword || !dbName) {
    console.log("Master password cannot be empty.");
    passwordManagerMenu();
  }

  const username = "test";
  const password = "test";
  const title = "test";
  entries.push({ title, username, password });
  currentDB = dbName;
  imageHash = getImgHash(imagePath);
  let combinedHash = masterPassword + imageHash;
  await connectSQLDatabase();
  await createDBandEncrypt(dbName, entries, combinedHash);
}

async function connectSQLDatabase() {
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });
    console.log();
    console.log("Successfully connected to the database.");
  } catch (error) {
    console.error("Error connecting to database: ", error);
    welcomeMenu();
  }
}

// Function to create a new password database
async function testSQLDatabase() {
  try {
    await connectSQLDatabase();

    //await createSqlDatabase("testDBCreation");

    const [databases] = await connection.query("SHOW DATABASES");
    console.log("Databases:", databases);

    //await createPWTable();
    //console.log("Successfully created password table!");

    //await deleteTable("encrypted_data");
    //await deleteDatabase("SQLdb");

    const [tables] = await connection.query("SHOW TABLES");
    console.log("Tables: ", tables);

    await connection.end();
  } catch (error) {
    console.error("Error querying tables/databases: ", error);
    welcomeMenu();
  }
}

// Function to open an existing password database
async function openDatabase() {
  masterPassword = "";
  currentIV = "";
  currentDB = "";
  entries = [];
  const { masterPassword: userMasterPassword, dbName } = await inquirer.prompt([
    {
      type: "input",
      name: "dbName",
      message: "Enter existing db name: ",
    },
    {
      type: "password",
      name: "masterPassword",
      message: "Enter master password",
    },
  ]);

  masterPassword = userMasterPassword;

  const fileContent = fs.readFileSync(`./${dbName}.csv`, "utf-8");
  const rows = fileContent.trim().split("\n");

  if (rows.length < 2) {
    console.log("Invalid CSV format.");
    passwordManagerMenu();
    return;
  }

  const [header, dataRow] = rows;
  const [iv, encryptedData] = dataRow.split(",");
  currentDB = dbName;
  currentIV = iv;
  loadDatabase(dbName, encryptedData, masterPassword, iv);
}

// Function to open an existing password database
async function openSqlDatabase() {
  masterPassword = "";
  currentIV = "";
  currentDB = "";
  entries = [];
  const {
    masterPassword: userMasterPassword,
    dbName,
    imagePath: userImagePath,
  } = await inquirer.prompt([
    {
      type: "input",
      name: "dbName",
      message: "Enter existing db name: ",
    },
    {
      type: "password",
      name: "masterPassword",
      message: "Enter master password",
    },
    {
      type: "input",
      name: "imagePath",
      message: "Enter image path: ",
    },
  ]);

  masterPassword = userMasterPassword;
  imagePath = userImagePath;
  imageHash = getImgHash(imagePath);
  currentDB = dbName;

  try {
    //if(!connection){
    //await connectSQLDatabase();
    //}
    await connectSQLDatabase();

    await connection.query(`USE ${mysql.escapeId(dbName)}`);
    console.log("Using database: ", mysql.escapeId(dbName));
    const sqlStatement =
      "SELECT iv, encrypted_data FROM encrypted_data LIMIT 1;"; //only fetch the first row
    const [rows] = await connection.query(sqlStatement);

    if (rows.length > 0) {
      const { iv, encrypted_data } = rows[0];
      //console.log('IV:', iv);
      //console.log('Encrypted Data:', encrypted_data);

      // Use or return the iv and encrypted_data as needed
      currentIV = iv;
      await loadDatabase(
        dbName,
        encrypted_data,
        masterPassword + imageHash,
        iv
      );
    } else {
      console.log("No data found.");
      passwordManagerMenu();
    }
  } catch (error) {
    console.error("Error fetching encrypted data:", error.message);
    return { iv: null, encryptedData: null };
  }
}

// Function to load a password database
async function loadDatabase(dbName, encryptedData, masterPassword, iv) {
  try {
    const decryptedData = decrypt(encryptedData, masterPassword, iv);
    entries = JSON.parse(decryptedData);
    console.log();
    console.log(`Database '${dbName}' opened successfully!`);
    passwordVaultMenu();
  } catch (error) {
    console.log("Error parsing or decrypting database:", error.message);
    passwordManagerMenu();
  }
}

// Menu for managing passwords
async function passwordVaultMenu() {
  console.log();
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: `Welcome to the password vault: ${currentDB}`,
      choices: ["View Entries", "Add new entry", "Delete Entry", "Back"],
    },
  ]);

  switch (choice) {
    case "View Entries":
      await viewEntries();
      break;
    case "Add new entry":
      await addEntry();
      break;
    case "Delete Entry":
      deleteEntry();
      break;
    case "Back":
      await passwordManagerMenu();
      break;
    default:
      console.log("Invalid choice.");
      passwordVaultMenu();
  }
}

// Function to create a CSV file and encrypt the database
async function createCSVandEncrypt(dbName, data, masterPassword) {
  try {
    const { iv, encryptedData } = encrypt(JSON.stringify(data), masterPassword);
    const writeData = `IV,EncryptedData\n${iv},${encryptedData}`;
    fs.writeFileSync(`./${dbName}.csv`, writeData, "utf-8");
    console.log(`${dbName}.csv created successfully!`);
    passwordVaultMenu();
  } catch (error) {
    console.log("Error saving the database:", error.message);
    welcomeMenu();
  }
}

// Function to create a SQL DB and encrypt the database
async function createDBandEncrypt(dbName, data, masterPassword) {
  try {
    const { iv, encryptedData } = encrypt(JSON.stringify(data), masterPassword);

    //const writeData = `IV,EncryptedData\n${iv},${encryptedData}`;
    //fs.writeFileSync(`./${dbName}.csv`, writeData, "utf-8");
    await createSqlDatabase(dbName);
    await connection.query(`USE ${mysql.escapeId(dbName)}`);
    //console.log("Using database: ", mysql.escapeId(dbName));
    await createPWTable(iv, encryptedData);

    passwordVaultMenu();
  } catch (error) {
    console.log("Error saving the database:", error.message);
    welcomeMenu();
  }
}

// Function to create a new database
async function createSqlDatabase(databaseName) {
  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(databaseName)}`
    );
    console.log(`Database "${databaseName}" created successfully.`);
  } catch (error) {
    console.error("Error creating the database:", error);
    console.log(query);
    passwordManagerMenu();
  }
}

// Function to create the 'password' table
async function createPWTable(iv, encryptedData) {
  if (!connection) {
    return;
  }

  try {
    const createTableSql = `
    CREATE TABLE IF NOT EXISTS encrypted_data (
      id INT AUTO_INCREMENT PRIMARY KEY,
      iv CHAR(32),
      encrypted_data TEXT
    )
    `;

    // Executing the SQL statement to create the table
    await connection.query(createTableSql);
    //console.log("Table for storing IV and encrypted data created successfully.");

    // Executing the SQL statement to insert the record into the table
    const insertSql = `INSERT INTO encrypted_data (iv, encrypted_data) VALUES (?, ?)`;
    await connection.query(insertSql, [iv, encryptedData]);
    console.log("Encrypted data stored successfully.");
  } catch (error) {
    console.error("Error creating the table: ", error);
  }
}

// Function to view stored entries
async function viewEntries() {
  console.log();
  console.log("-------- Stored Credentials --------");

  const entriesToShow = entries.map((entry, index) => ({
    index: index + 1,
    title: entry.title,
    username: entry.username,
    password: "*****", // Hide the password
  }));

  console.table(entriesToShow);

  const { copyPassword } = await inquirer.prompt([
    {
      type: "confirm",
      name: "copyPassword",
      message: "Do you want to copy a password to clipboard?",
    },
  ]);

  if (copyPassword) {
    const { entryIndex } = await inquirer.prompt([
      {
        type: "number",
        name: "entryIndex",
        message: "Enter the index of the entry to copy:",
        validate: (input) => {
          const index = parseInt(input);
          return !isNaN(index) && index >= 1 && index <= entries.length;
        },
      },
    ]);

    const selectedEntry = entries[entryIndex - 1];

    if (selectedEntry) {
      const selectedPassword = selectedEntry.password;
      clipboardy.writeSync(selectedPassword);
      console.log("Password copied to clipboard. Validity: 10 sec");
      await new Promise((resolve) => setTimeout(resolve, 10000));
      clipboardy.writeSync("");
    } else {
      console.log("Invalid entry index.");
    }

    passwordVaultMenu();
  } else {
    passwordVaultMenu();
  }
}

// Newly added, function to hash and combine the master password and image hash
function createPasswordHash(masterPassword, imageHash) {
  const combined = masterPassword + imageHash;
  return crypto.createHash("sha256").update(combined).digest("hex");
}

// Function to add a new entry
async function addEntry() {
  const { title, userName, useRandomPassword, password } =
    await inquirer.prompt([
      {
        type: "input",
        name: "title",
        message: "Enter entry title:",
      },
      {
        type: "input",
        name: "userName",
        message: "Enter username:",
      },
      {
        type: "confirm",
        name: "useRandomPassword",
        message: "Do you want to generate a random password?",
        default: true,
      },
      {
        type: "password",
        name: "password",
        message: "Enter password:",
        when: (answers) => !answers.useRandomPassword,
      },
    ]);

  let newPassword = password;

  // Generate random password
  if (useRandomPassword) {
    const length = 16;
    const charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+";
    const randomBytes = crypto.randomBytes(length);
    const maxIndex = charset.length;

    let generatedPassword = "";
    for (let i = 0; i < length; i++) {
      const randomIndex = randomBytes[i] % maxIndex;
      generatedPassword += charset.charAt(randomIndex);
    }

    newPassword = generatedPassword;

    console.log(`Generated random password: ${newPassword}`);
  }

  entries.push({ title, username: userName, password: newPassword });
  console.log();
  console.log(`Entry ${title} has been added!`);
  saveSqlDatabase();
}

// Function to delete an entry
async function deleteEntry() {
  console.log();
  console.log("-------- Delete Entry --------");

  if (entries.length === 0) {
    console.log("No entries to delete.");
    passwordVaultMenu();
    return;
  }

  const entryChoices = entries.map((entry, index) => ({
    value: index,
    name: `${index + 1}. Title: ${entry.title}, Username: ${
      entry.username
    }, Password: *****`,
  }));

  const { entryIndex } = await inquirer.prompt([
    {
      type: "list",
      name: "entryIndex",
      message: "Select an entry to delete:",
      choices: entryChoices,
    },
  ]);

  const deletedEntry = entries.splice(entryIndex, 1)[0];
  console.log(
    `Entry deleted successfully: Title: ${deletedEntry.title}, Username: ${deletedEntry.username}`
  );
  saveSqlDatabase();
}

//show help menu
async function showHelpMenu() {
  console.log();
  console.log(
    "Welcome to PassBot!\n\nThis tool enables you to generate and manage secure passwords. An image is used as 'salt' data which adds an extra layer of protection to your credentials.\n\nTo begin using, simply select either 'Password Manager' (Recommended for storing and managing existing credentials) or 'Password Generator' (Recommended for generating new credentials) from the main menu and follow the on-screen steps. If this is your first time using the tool, you will need to create a database.\n\nFor more information - https://github.com/jugal09xx/passbot-789\n\nThank you! - PassBot Dev Team\n"
  );
  welcomeMenu();
}
