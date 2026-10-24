//! Agent label layer. Separate from the base graph; never overwrites base labels.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentLabel {
    pub text: String,
    /// Who produced it (model id, tool, person).
    pub author: String,
    /// Graph node content hash the label was written against, to detect staleness.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_hash: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LabelLayer {
    pub labels: BTreeMap<String, AgentLabel>,
}

impl LabelLayer {
    pub fn to_json(&self) -> String {
        let mut s = serde_json::to_string_pretty(self).expect("labels serialize");
        s.push('\n');
        s
    }
}
