import { expect } from "chai";
import { ethers } from "hardhat";

describe("PromptMarketplace", function () {
  async function deploy() {
    const [seller, buyer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("PromptMarketplace");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();
    return { contract, seller, buyer };
  }

  it("starts with zero listings", async function () {
    const { contract } = await deploy();
    expect(await contract.listingCount()).to.equal(0n);
  });

  it("getListings returns empty array initially", async function () {
    const { contract } = await deploy();
    const listings = await contract.getListings();
    expect(listings.length).to.equal(0);
  });

  it("buyPrompt reverts when listing does not exist", async function () {
    const { contract, buyer } = await deploy();
    await expect(
      contract.connect(buyer).buyPrompt(0n, { value: ethers.parseEther("0.01") })
    ).to.be.revertedWith("Listing not active");
  });

  it("getPromptCID reverts when not purchased", async function () {
    const { contract, buyer } = await deploy();
    await expect(
      contract.connect(buyer).getPromptCID(0n)
    ).to.be.revertedWith("Not purchased");
  });
});
