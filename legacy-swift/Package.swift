// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "SheetsReader",
    platforms: [
        .macOS(.v13)
    ],
    dependencies: [
        // Used for signing the Service Account JWT with RS256.
        .package(url: "https://github.com/vapor/jwt-kit.git", from: "4.13.0")
    ],
    targets: [
        .executableTarget(
            name: "SheetsReader",
            dependencies: [
                .product(name: "JWTKit", package: "jwt-kit")
            ]
        )
    ]
)
