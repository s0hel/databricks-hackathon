We need to satisfy the following requirements:

Use case 1
- Question: Can this facility actually do what it claims?

  Build an app that evaluates facility claims for capabilities such as ICU, maternity, emergency, oncology, trauma, or 
NICU. For each facility and capability, produce a trust signal such as strong evidence, partial evidence, weak or 
suspicious evidence, or no claim.

Use case 2
- Question: Where are the highest-risk gaps in care, and how confident are we that those gaps are real?

  Build an app that aggregates trust-weighted facility evidence across geography, such as state, city, district, or 
  PIN code. Help planners distinguish real care gaps from data-poor regions.

Use case 3
- Question: Where should a patient or coordinator actually go?

  Build an app where a user enters a location and a care need, such as “dialysis near Jaipur” or “emergency surgery 
  near Patna,” and receives an evidence-attached shortlist of candidate facilities.

We do need to resolve data quality issues before jumping into implemenation.  This is the analysis from Genie for our tables:

we have tables in lakebase:
- hackathon_lb.public.facilities
- hackathon_lb.public.health_indicators
- hackathon_lb.public.pincode_directory

Data Quality Analysis for Healthcare Gap Identification
I've identified several critical data quality issues that will significantly impact your ability to determine healthcare gaps in the region. The most severe issue requires immediate attention before conducting meaningful gap analysis.
Data Quality Issues Prioritized by Impact
Severity
Issue
Affected Records
Impact on Healthcare Gap Analysis
Critical
Facilities State Field Contains Districts/Cities
234
Prevents accurate state-level healthcare gap analysis
High
Missing Coordinates in Pincode Directory
12,009
Limits geographic matching for 7.3% of pincode records
Medium
State Name Spelling Inconsistency
1
Maharashtra vs Maharastra prevents joining health indicators with facilities
Low
Missing Coordinates in Facilities
30
Only 0.3% of facilities affected, minimal impact
Low
Missing Facility Type
57
Cannot classify 0.6% of facilities by type
Source:
Data quality issues prioritized by impact on healthcare gap analysis
Critical Issues
1. Facilities State Field Contains District/City Names Instead of States
   The most critical problem is that the address_state_or_region field in the facilities table contains 234 distinct values, including many district and city names rather than actual state names 1. Examples include "Ahmedabad", "Thane", "Navi Mumbai", "Ajmer", and "Barmer" - all of which are cities or districts, not states 2.
   Impact: This prevents accurate state-level matching between facilities and health indicators, making it impossible to reliably identify which districts have adequate healthcare coverage.
2. State Name Spelling Inconsistency
   The health indicators table uses "Maharastra" while the facilities table uses "Maharashtra" 3. This spelling difference prevents joining these tables to correlate health needs with facility availability.
   Geographic Data Issues
3. Missing Coordinates in Pincode Directory
   The pincode directory has 12,009 records (7.3%) missing latitude/longitude coordinates 4. These missing coordinates are concentrated in remote areas like the Nicobar Islands 5, which limits your ability to perform distance-based analysis for identifying underserved areas.
4. Missing Coordinates in Facilities
   Only 30 facilities (0.3%) are missing coordinates 6, which is a relatively minor issue. These facilities are spread across multiple states 7.

Data Linking Challenges
5. District Name Mismatches
   Many districts in the health indicators table have zero matching facilities when attempting to join by district name 8. This is partly due to the state field issue mentioned above, but also suggests district name variations between tables (e.g., trailing spaces in names like "Lakshadweep " and "South Andaman ").
   Minor Issues
6. Missing Facility Type Classification
   57 facilities (0.6%) are missing the facility_type_id field 9, affecting 21 states. Additionally, there's a spelling inconsistency with "farmacy" vs "pharmacy" 10.
   Recommendations
   Immediate Actions Required:
   Standardize the facilities state field - Map district/city names to their correct state names to enable proper state-level analysis
   Fix state name spelling - Standardize "Maharashtra" vs "Maharastra" across tables
   Geocode missing coordinates - Prioritize the 12,009 pincode records and 30 facilities missing coordinates
   Normalize district names - Remove trailing spaces and standardize naming conventions for reliable joins
   Data Quality Summary:
   Health indicators table: Excellent completeness with no missing values for key metrics 11
   Facilities table: Good overall quality (99.7% have coordinates) but critical state field issue 6
   Pincode directory: Moderate quality with 7.3% missing coordinates 4
   Without addressing the state field standardization issue, any healthcare gap analysis will produce unreliable results, as you cannot accurately match health needs (from health indicators) with facility availability (from facilities table).

My suggestion would be to address the critical issues first.  Then after that, we can start addressing use case 1.  Create a todo list file called 'TODO.md', so that I can create new sessions to continue the work