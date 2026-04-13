# Stack Internal API Import (so4t_api_import)
An API script for Stack Internal that facilitates bulk-importing questions, answers, or articles from a CSV file.

## Requirements
* A Stack Internal instance (Business or Enterprise)
* Python 3.x ([download](https://www.python.org/downloads/))
* Operating system: Linux, MacOS, or Windows

## Setup

[Download](https://github.com/StackExchange/so4t_api_import/archive/refs/heads/main.zip) and unpack the contents of this repository

**Install Required Python Libraries**

* Open a terminal window (or, for Windows, a command prompt)
* Navigate to the directory where you unpacked the files
* Install the dependencies: `pip3 install -r requirements.txt`

**API Authentication**

For the Business tier, you'll need a [personal access token](https://stackoverflowteams.help/en/articles/4385859-stack-overflow-for-teams-api) (PAT). You'll need to obtain an API key and an access token for Enterprise. Documentation for creating an Enterprise key and token can be found within your instance at this url: `https://[your_site]/api/docs/authentication`

**Generating an Access Token (Enterprise)**

For secure Access Token generation, follow the [Secure API Token Generation with OAuth and PKCE](https://support.stackenterprise.co/support/solutions/articles/22000294542-secure-api-token-generation-with-oauth-and-pkce) guide.

**Note on Access Token Requirements:**
While API v3 now generally allows querying with just an API key for most GET requests, certain paths and data (e.g., `/images` and the email attribute on a `User` object) still specifically require an Access Token for access. If you encounter permissions errors on such paths, ensure you are using an Access Token.

## Basic Usage
First, you'll need to populate a CSV with content to import into Stack Internal. There's a [CSV Templates](https://github.com/StackExchange/so4t_api_import/tree/main/CSV%20Templates) directory in this project that you can use as a starting point. The CSV files found therein are preformatted with the proper column names.

Once a CSV file is created, open a terminal window and navigate to the directory where you unpacked the script. Examples of running the script:
* Importing questions into Business from a CSV file named 'questions.csv': 
`python3 so4t_api_import.py --url "https://stackoverflowteams.com/c/TEAM-NAME" --token "YOUR_TOKEN" --csv 'questions.csv' --questions`
* Importing articles into Enterprise from a CSV file named 'articles.csv': `python3 so4t_api_import.py --url "https://SUBDOMAIN.stackenterprise.co" --key "YOUR_KEY --token "YOUR_TOKEN" --csv 'articles.csv' --articles`

Standard usage of the script will involve using the following arguments:
* `--url https://your.instance.url`
* `--token 'YOUR_TOKEN'`
* `--key 'YOUR_KEY'` [only required for Enterprise]
* `--csv 'path/to/file.csv'`
* `--articles` or `--questions` [one or the other, depending on what you're importing]

You can also view available arguments and descriptions via the `--help` argument. Example: `python3 so4t_api_import.py --help`

As the script runs, it will update the terminal window with the tasks it performs.

## Advanced Usage: User Impersonation (Legacy Feature)
**Important Note:** The user impersonation functionality is a legacy feature primarily intended for specific, complex content migration scenarios. Its use is generally **discouraged** for ongoing operations due to its advanced nature and potential complexities.

If you believe you require user impersonation for your specific import needs:

* This functionality is not enabled by default and **requires opening a ticket with enterprise-support@stackoverflow.com to discuss your specific use case and enable it.**
* It also requires a [service key](https://stackoverflowteams.help/en/articles/8043418-stack-overflow-for-teams-api-v3#manage-api-v3-applications-and-service-keys) (owner set to Community user) with admin privileges to configure and use this API script's impersonation functionality.
* Adding the `--impersonate` argument to the basic usage of the script allows you to leverage this functionality. You'll need to use an impersonation CSV format, which includes additional columns for the account IDs of the users to impersonate. Please see the [CSV Templates](https://github.com/StackExchange/so4t_api_import/tree/main/CSV%20Templates) directory and use a template with the 'impersonation' prefix.

## Known limitations and considerations

* Articles can only be imported at a rate of one per minute. Yes, it's slow. This limitation is in API v2.3. API v3 does not have this limitation, and it's the version of the API the script uses for importing questions and answers, which is much faster. However, API v3 is still a work in progress and does not yet support Articles.
* Source content that contains images, embeds, and attachments cannot be imported via API. Images can be imported by copy-paste after the bulk import is completed. Embeds and attachments can likewise be added post-import by either copying their contents or hyperlinking to the external file. 
* Question imports are currently designed to support importing a corresponding answer. This is on the backlog for improvement.

If you encounter problems using the script, please leave feedback in the Github Issues. You can also clone and change the script to suit your needs. It is provided as-is, with no warranty or guarantee of any kind.
