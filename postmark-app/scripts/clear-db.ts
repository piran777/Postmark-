import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Clearing database...");
  
  // Delete in order due to foreign key constraints
  await prisma.message.deleteMany();
  console.log("✓ Deleted all messages");
  
  await prisma.emailAccount.deleteMany();
  console.log("✓ Deleted all email accounts");
  
  await prisma.userPreference.deleteMany();
  console.log("✓ Deleted all user preferences");
  
  await prisma.user.deleteMany();
  console.log("✓ Deleted all users");
  
  console.log("\nDatabase cleared! You can now create a fresh account.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

