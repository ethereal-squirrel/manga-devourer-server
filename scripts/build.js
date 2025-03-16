const { execSync } = require("child_process");

// Main build process
const build = () => {
  const platform = process.argv[2];
  if (!platform) {
    throw new Error("Platform must be specified: win, linux, or macos");
  }

  console.log("Building TypeScript...");
  execSync("npm run build", { stdio: "inherit" });

  console.log("Generating Prisma client...");
  execSync("npm run pkg:generate", { stdio: "inherit" });

  console.log(`Building executable for ${platform}...`);
  execSync(
    `pkg . --targets node20-${platform}-x64 --no-bytecode --public-packages "*" --public`,
    { stdio: "inherit" }
  );

  console.log("Build complete!");
};

build();
