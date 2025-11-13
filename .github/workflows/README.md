# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the Microsoft Agent 365 SDK for Node.js repository.

## CI Workflow (ci.yml)

The main CI workflow builds, tests, and prepares SDK packages for publishing:

### Jobs

#### JavaScript/Node.js SDK (`javascript-sdk`)
- **Matrix**: Node.js 18 and 20
- **Steps**:
  - Install npm dependencies
  - Run ESLint for code quality
  - Build TypeScript to JavaScript
  - Run Jest tests
  - *Publishing to NPM (commented out for now)*

### Triggers

- **Push**: Triggers on pushes to `main` or `master` branches
- **Pull Request**: Triggers on pull requests targeting `main` or `master` branches

## 📋 Telemetry

Data Collection. The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft's privacy statement. Our privacy statement is located at https://go.microsoft.com/fwlink/?LinkID=824704. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details.
