import { ethers } from "hardhat";

async function main() {
  console.log("Deploying PromptMarketplace to Fhenix Helium...");
  const Factory = await ethers.getContractFactory("PromptMarketplace");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("PromptMarketplace deployed to:", address);
  console.log("→ Copy this address into lib/contract.ts as CONTRACT_ADDRESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
