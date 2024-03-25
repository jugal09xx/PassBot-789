// Import dependencies
import inquirer from "inquirer";
import fs from "fs";
import crypto from "crypto";
import clipboardy from "clipboardy";
import figlet from "figlet";


// Initialize the application
welcomeMenu();

// Global variables
let masterPassword;
let currentIV;
let currentDB;
let entries = [];

// Newly added, imageHash variable
let imageHash;

// Encryption function to encrypt data
function encrypt(data, masterPassword) {
  const key = crypto.createHash("sha256").update(masterPassword).digest("hex");
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
function saveDatabase() {
  try {
    const encryptedData = encryptExistingFile(
      JSON.stringify(entries),
      masterPassword,
      currentIV
    );
    const writeData = `IV,EncryptedData\n${currentIV.toString(
      "hex"
    )},${encryptedData}`;
    fs.writeFileSync(`./${currentDB}.csv`, writeData, "utf-8");
    console.log(`${currentDB}.csv saved successfully!`);
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

// Newly added, function to hash image
function hashImage(imageBuffer) {
  const hash = crypto.createHash('sha256');
  hash.update(imageBuffer);
  return hash.digest('hex');
}

// Newly added, function for image upload
async function imageUpload() {
  const { imagePath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'imagePath',
      message: "Please enter the image path to finish upload:",
      validate: input => {

        if (fs.existsSync(input)) {
          return true;
        }
        return 'The file path does not exist. Please enter a vlid path.'
      }
    },
  ]);

    // Read the image file from the provided path
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      imageHash = hashImage(imageBuffer);

      // To be deleted, for testing purpose only
      console.log("Hash: ", imageHash);

      console.log('The image has been processed successfully.');
      return imageHash; // The hashed image data can be used as a salt
    } catch (error) {
      console.error('An error occurred while processing the image:', error);
      throw error; // Rethrow the error for the caller to handle
    }

  } // End of imageUpload()


// Main menu for the application
async function welcomeMenu() {
  //console.log();
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "PassBot-789 - A Secure Password Manager",
      choices: ["Open Existing Database", "Create New Database", "Image Upload","Exit"],
    },
  ]);

  switch (choice) {
    case "Create New Database":
      await createDatabase();
      break;
    case "Open Existing Database":
      await openDatabase();
      break;
    case "Exit":
      console.log("Exiting...");
      break;
    case "Image Upload":
      await imageUpload();
      break;
    default:
      console.log("Invalid choice!");
      welcomeMenu();
  }
}

// Function to create a new password database
async function createDatabase() {
  masterPassword = "";
  currentIV = "";
  currentDB = "";
  entries = [];
  const { dbName, masterPassword: userMasterPassword } = await inquirer.prompt([
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
  ]);

  masterPassword = userMasterPassword;

  if (!masterPassword || !dbName) {
    console.log("Master password cannot be empty.");
    welcomeMenu();
  }

  const username = "test";
  const password = "test";
  const title = "test";
  entries.push({ title, username, password });
  currentDB = dbName;
  createCSVandEncrypt(dbName, entries, masterPassword);
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
    welcomeMenu();
    return;
  }

  const [header, dataRow] = rows;
  const [iv, encryptedData] = dataRow.split(",");
  currentDB = dbName;
  currentIV = iv;
  loadDatabase(dbName, encryptedData, masterPassword, iv);
}

// Function to load a password database
async function loadDatabase(dbName, encryptedData, masterPassword, iv) {
  try {
    const decryptedData = decrypt(encryptedData, masterPassword, iv);
    entries = JSON.parse(decryptedData);
    console.log()
    console.log(`Database '${dbName}' opened successfully!`);
    passwordVaultMenu();
  } catch (error) {
    console.log("Error parsing or decrypting database:", error.message);
    welcomeMenu();
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
      await welcomeMenu();
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
  return crypto.createHash('sha256').update(combined).digest('hex');
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
    const length = 16
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
  console.log(`Entry ${title} has been added!`);
  saveDatabase();
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
  saveDatabase();
}
