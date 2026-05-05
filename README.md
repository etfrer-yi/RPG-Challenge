

# Free-flowing thinking

Questions:

- lots of invoices/receipts/records for paid - do we also handle inflow of cash (e.g., successful client paying us)?
- what kind of questions are we thinking to answer here? some of the data suggest that we're trying to compile all the invoices, but `notes.txt` seems to hint at potential refunds and future actions instead
- I see the dog - miscellaneous data must be filtered out
- can we assume that we will have something like notes.txt?
- what do the amounts mean on a record (of CSV)? I thought a minus ("-") means a deduction from my account, but based on notes.txt, it is a refund. It's a refund that adds to me. My bank account is the reverse...
- Unclean data: data formats - datetime, 1750 without $ sign in invoices.xlsx, Mar 28 - 2025 with weird date format without comma
- for structured data - a proper receipt or, and especially, a CSV file of transactions - what are the possible fields?

Thinking...

- Can keep it generic, it could be a freelancer or a person in general with a lot of financial transactions
- Structured data - xlsx (?); Unstructured data - img, text, pdf



Input:

A folder containing all the relevant files


Output:

- Past transactions:
  Date: could be roughly, not necessarily proper datetime. Should be date of transaction
  Description: nullable
  Actor: nullable
  Amount: +/-
- Future actions:
  Actor:
  Description:
  Deadline:
